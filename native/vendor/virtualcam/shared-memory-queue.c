#include <windows.h>
#include "shared-memory-queue.h"
#include "tiny-nv12-scale.h"

#define VIDEO_NAME L"DroidVideoVirtualCamVideo"

enum queue_type {
	SHARED_QUEUE_TYPE_VIDEO,
};

struct queue_header {
	volatile uint32_t write_idx;
	volatile uint32_t read_idx;
	volatile uint32_t state;

	uint32_t offsets[3];

	uint32_t type;

	uint32_t cx;
	uint32_t cy;
	uint64_t interval;

	uint32_t reserved[8];
};

struct video_queue {
	HANDLE handle;
	bool ready_to_read;
	struct queue_header *header;
	uint64_t *ts[3];
	uint8_t *frame[3];
	long last_inc;
	int dup_counter;
	bool is_writer;
	size_t mapped_size;
};

#define ALIGN_SIZE(size, align) size = (((size) + (align - 1)) & (~(align - 1)))
#define FRAME_HEADER_SIZE 32

video_queue_t *video_queue_create(uint32_t cx, uint32_t cy, uint64_t interval)
{
	if (cx < 2 || cy < 2 || cx > 4096 || cy > 4096 || (cx & 1) || (cy & 1) || !interval)
		return NULL;
	struct video_queue vq = {0};
	struct video_queue *pvq;
	DWORD frame_size = cx * cy * 3 / 2;
	uint32_t offset_frame[3];
	DWORD size;

	size = sizeof(struct queue_header);

	ALIGN_SIZE(size, 32);

	offset_frame[0] = size;
	size += frame_size + FRAME_HEADER_SIZE;
	ALIGN_SIZE(size, 32);

	offset_frame[1] = size;
	size += frame_size + FRAME_HEADER_SIZE;
	ALIGN_SIZE(size, 32);

	offset_frame[2] = size;
	size += frame_size + FRAME_HEADER_SIZE;
	ALIGN_SIZE(size, 32);

	struct queue_header header = {0};

	header.state = SHARED_QUEUE_STATE_STARTING;
	header.cx = cx;
	header.cy = cy;
	header.interval = interval;
	vq.is_writer = true;

	for (size_t i = 0; i < 3; i++) {
		uint32_t off = offset_frame[i];
		header.offsets[i] = off;
	}

	/* fail if already in use */
	vq.handle = OpenFileMappingW(FILE_MAP_READ, false, VIDEO_NAME);
	if (vq.handle) {
		CloseHandle(vq.handle);
		return NULL;
	}

	vq.handle = CreateFileMappingW(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, size, VIDEO_NAME);
	if (!vq.handle) {
		return NULL;
	}

	vq.header = (struct queue_header *)MapViewOfFile(vq.handle, FILE_MAP_ALL_ACCESS, 0, 0, 0);
	if (!vq.header) {
		CloseHandle(vq.handle);
		return NULL;
	}
	memcpy(vq.header, &header, sizeof(header));

	for (size_t i = 0; i < 3; i++) {
		uint32_t off = offset_frame[i];
		vq.ts[i] = (uint64_t *)(((uint8_t *)vq.header) + off);
		vq.frame[i] = ((uint8_t *)vq.header) + off + FRAME_HEADER_SIZE;
	}
	pvq = malloc(sizeof(vq));
	if (!pvq) {
		UnmapViewOfFile(vq.header);
		CloseHandle(vq.handle);
		return NULL;
	}
	memcpy(pvq, &vq, sizeof(vq));
	return pvq;
}

video_queue_t *video_queue_open()
{
	struct video_queue vq = {0};

	vq.handle = OpenFileMappingW(FILE_MAP_READ, false, VIDEO_NAME);
	if (!vq.handle) {
		return NULL;
	}

	vq.header = (struct queue_header *)MapViewOfFile(vq.handle, FILE_MAP_READ, 0, 0, 0);
	if (!vq.header) {
		CloseHandle(vq.handle);
		return NULL;
	}
	MEMORY_BASIC_INFORMATION region;
	if (!VirtualQuery(vq.header, &region, sizeof(region)) || region.RegionSize < sizeof(struct queue_header)) {
		UnmapViewOfFile(vq.header);
		CloseHandle(vq.handle);
		return NULL;
	}
	vq.mapped_size = region.RegionSize;

	struct video_queue *pvq = malloc(sizeof(vq));
	if (!pvq) {
		UnmapViewOfFile(vq.header);
		CloseHandle(vq.handle);
		return NULL;
	}
	memcpy(pvq, &vq, sizeof(vq));
	return pvq;
}

void video_queue_close(video_queue_t *vq)
{
	if (!vq) {
		return;
	}
	if (vq->is_writer) {
		vq->header->state = SHARED_QUEUE_STATE_STOPPING;
	}

	UnmapViewOfFile(vq->header);
	CloseHandle(vq->handle);
	free(vq);
}

void video_queue_get_info(video_queue_t *vq, uint32_t *cx, uint32_t *cy, uint64_t *interval)
{
	struct queue_header *qh = vq->header;
	*cx = qh->cx;
	*cy = qh->cy;
	*interval = qh->interval;
}

#define get_idx(inc) ((unsigned long)inc % 3)

void video_queue_write(video_queue_t *vq, uint8_t **data, uint32_t *linesize, uint64_t timestamp)
{
	struct queue_header *qh = vq->header;
	long inc = ++qh->write_idx;

	unsigned long idx = get_idx(inc);
	uint32_t cx = qh->cx;
	uint32_t cy = qh->cy;
	size_t size = (size_t)cx * cy;

	*vq->ts[idx] = timestamp;
	if (linesize[0] == cx) {
		memcpy(vq->frame[idx], data[0], size);
	} else {
		for (uint32_t row = 0; row < cy; row++)
			memcpy(vq->frame[idx] + (size_t)row * cx, data[0] + (size_t)row * linesize[0], cx);
	}
	if (linesize[1] == cx) {
		memcpy(vq->frame[idx] + size, data[1], size / 2);
	} else {
		for (uint32_t row = 0; row < cy / 2; row++)
			memcpy(vq->frame[idx] + size + (size_t)row * cx, data[1] + (size_t)row * linesize[1], cx);
	}

	MemoryBarrier();
	qh->read_idx = inc;
	MemoryBarrier();
	qh->state = SHARED_QUEUE_STATE_READY;
}

enum queue_state video_queue_state(video_queue_t *vq)
{
	if (!vq) {
		return SHARED_QUEUE_STATE_INVALID;
	}

	enum queue_state state = (enum queue_state)vq->header->state;
	MemoryBarrier();
	if (!vq->ready_to_read && state == SHARED_QUEUE_STATE_READY) {
		struct queue_header *qh = vq->header;
		if (qh->cx < 2 || qh->cy < 2 || qh->cx > 4096 || qh->cy > 4096 || (qh->cx & 1) || (qh->cy & 1) || !qh->interval)
			return SHARED_QUEUE_STATE_INVALID;
		size_t frame_size = (size_t)qh->cx * qh->cy * 3 / 2;
		size_t previous_end = sizeof(struct queue_header);
		for (size_t i = 0; i < 3; i++) {
			size_t offset = qh->offsets[i];
			if ((offset & 31) || offset < previous_end || offset > vq->mapped_size || frame_size + FRAME_HEADER_SIZE > vq->mapped_size - offset)
				return SHARED_QUEUE_STATE_INVALID;
			previous_end = offset + FRAME_HEADER_SIZE + frame_size;
		}
		for (size_t i = 0; i < 3; i++) {
			size_t off = vq->header->offsets[i];
			vq->ts[i] = (uint64_t *)(((uint8_t *)vq->header) + off);
			vq->frame[i] = ((uint8_t *)vq->header) + off + FRAME_HEADER_SIZE;
		}
		vq->ready_to_read = true;
	}

	return state;
}

bool video_queue_read(video_queue_t *vq, nv12_scale_t *scale, void *dst, uint64_t *ts)
{
	struct queue_header *qh = vq->header;
	long inc = qh->read_idx;
	MemoryBarrier();

	if (!vq->ready_to_read || qh->state != SHARED_QUEUE_STATE_READY) {
		return false;
	}

	if (inc == vq->last_inc) {
		if (++vq->dup_counter == 10) {
			return false;
		}
	} else {
		vq->dup_counter = 0;
		vq->last_inc = inc;
	}

	/* The writer reuses slot (inc % 3) when it starts frame inc + 3. If that
	 * happened during the copy, the picture may be torn; retry with the
	 * newest frame. After a few attempts keep the copy rather than stall. */
	for (int attempt = 0;; attempt++) {
		unsigned long idx = get_idx(inc);

		*ts = *vq->ts[idx];

		nv12_do_scale(scale, dst, vq->frame[idx]);

		MemoryBarrier();
		if ((uint32_t)(qh->write_idx - (uint32_t)inc) < 3 || attempt == 2)
			return true;

		inc = qh->read_idx;
		MemoryBarrier();
		vq->last_inc = inc;
	}
}

bool video_queue_read_latest(video_queue_t *vq, nv12_scale_t *scale, void *dst, uint64_t *ts)
{
    if (vq->header->read_idx == (uint32_t)vq->last_inc) return false;
    return video_queue_read(vq, scale, dst, ts);
}
