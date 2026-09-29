"""Generate platform icons from shared vector geometry. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parent.parent
brand=root/'assets/branding';brand.mkdir(parents=True,exist_ok=True)
public=root/'desktop/public'
res=root/'android/app/src/main/res'
mint='#A9EDC9';ink='#172B20'
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect width="108" height="108" rx="24" fill="{mint}"/>
  <rect x="22" y="32" width="52" height="46" rx="10" fill="{ink}"/>
  <path d="M72 46L88 36V74L72 64Z" fill="{ink}"/>
  <circle cx="48" cy="55" r="14" fill="{mint}"/>
  <circle cx="48" cy="55" r="6" fill="{ink}"/>
</svg>
'''
(brand/'icon.svg').write_text(svg,encoding='utf-8')
(public/'icon.svg').write_text(svg,encoding='utf-8')

# Render the same simple vector primitives at 8x for crisp small-size variants.
scale=16
im=Image.new('RGBA',(108*scale,108*scale),(0,0,0,0));d=ImageDraw.Draw(im)
def box(values):return tuple(round(v*scale) for v in values)
d.rounded_rectangle(box((0,0,108,108)),radius=24*scale,fill=mint)
d.rounded_rectangle(box((22,32,74,78)),radius=10*scale,fill=ink)
d.polygon([(x*scale,y*scale) for x,y in [(72,46),(88,36),(88,74),(72,64)]],fill=ink)
d.ellipse(box((34,41,62,69)),fill=mint)
d.ellipse(box((42,49,54,61)),fill=ink)
im.resize((512,512),Image.Resampling.LANCZOS).save(brand/'icon.png')
im.resize((256,256),Image.Resampling.LANCZOS).save(public/'icon.ico',format='ICO',sizes=[(s,s) for s in [16,24,32,48,64,128,256]])

camera=f'''    <path android:fillColor="{ink}" android:pathData="M32,32H64Q74,32 74,42V68Q74,78 64,78H32Q22,78 22,68V42Q22,32 32,32M72,46L88,36V74L72,64Z" />
    <path android:fillColor="{mint}" android:pathData="M48,41A14,14 0,1 0,48 69A14,14 0,1 0,48 41" />
    <path android:fillColor="{ink}" android:pathData="M48,49A6,6 0,1 0,48 61A6,6 0,1 0,48 49" />'''
def vector(content):return '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n'+content+'\n</vector>\n'
(res/'drawable/ic_launcher.xml').write_text(vector(f'    <path android:fillColor="{mint}" android:pathData="M0,0H108V108H0Z" />\n'+camera),encoding='utf-8')
(res/'drawable/ic_launcher_foreground.xml').write_text(vector(camera),encoding='utf-8')
mono='    <path android:fillColor="#FFFFFF" android:fillType="evenOdd" android:pathData="M32,32H64Q74,32 74,42V46L88,36V74L74,64V68Q74,78 64,78H32Q22,78 22,68V42Q22,32 32,32Z M48,41A14,14 0,1 0,48 69A14,14 0,1 0,48 41Z M48,49A6,6 0,1 0,48 61A6,6 0,1 0,48 49Z" />'
(res/'drawable/ic_launcher_monochrome.xml').write_text(vector(mono),encoding='utf-8')
(res/'drawable/ic_notification.xml').write_text(vector(mono),encoding='utf-8')
for qualifier,extra in [('mipmap-anydpi-v26',''),('mipmap-anydpi-v33','    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n')]:
 folder=res/qualifier;folder.mkdir(parents=True,exist_ok=True)
 (folder/'ic_launcher.xml').write_text('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/icon_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'+extra+'</adaptive-icon>\n',encoding='utf-8')
(res/'values').mkdir(exist_ok=True)
(res/'values/icon_colors.xml').write_text(f'<resources><color name="icon_background">{mint}</color></resources>\n',encoding='utf-8')
print('Generated SVG, PNG, Windows ICO, Android adaptive/themed and notification icons.')
