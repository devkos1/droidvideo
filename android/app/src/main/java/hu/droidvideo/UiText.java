package hu.droidvideo;
import android.content.Context;
final class UiText {
    static boolean english(Context c) { return c.getSharedPreferences("ui",0).getString("language","en").equals("en"); }
    static String choose(Context c,String en,String hu) { return english(c)?en:hu; }
}
