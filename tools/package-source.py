"""Create a clean, redistributable source archive without SDKs or build outputs."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os

root = Path(__file__).resolve().parent.parent
excluded = {"node_modules", "build", ".gradle", "dist", ".git", "__pycache__", ".build-deps"}
output = root / "dist" / "DroidVideo-0.3.1-Source.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for folder, directories, files in os.walk(root):
        directories[:] = [name for name in directories if name not in excluded]
        for name in files:
            item = Path(folder) / name
            if name not in {"local.properties", ".env"} and item.suffix not in {".log", ".jks", ".keystore", ".pdb", ".obj", ".lib", ".exp", ".ilk"}:
                archive.write(item, item.relative_to(root))
print(output)
