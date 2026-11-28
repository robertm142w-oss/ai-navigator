"""Install native sources and permissions into the generated Capacitor project."""

from pathlib import Path
import re
import shutil
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ANDROID_NS = "http://schemas.android.com/apk/res/android"
ANDROID_NAME = f"{{{ANDROID_NS}}}name"


def prepare_android(app_id: str) -> None:
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", app_id):
        raise ValueError("Invalid Android application ID")

    source = ROOT / "android/app/src/main"
    app_source = source / "java" / Path(*app_id.split("."))
    activity = app_source / "MainActivity.java"
    if not activity.is_file():
        raise FileNotFoundError(f"Run Capacitor Android setup first. Missing {activity}")

    overlay = ROOT / "android-overlay"
    for package, filename in (("voice", "WordVoicePlugin.java"), ("share", "WordSharePlugin.java"), ("device", "WordDevicePlugin.java")):
        plugin = source / "java/com/example/ainavigator" / package
        plugin.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(overlay / filename, plugin / filename)
    activity.write_text(
        f"""package {app_id};

import android.os.Bundle;
import com.example.ainavigator.device.WordDevicePlugin;
import com.example.ainavigator.share.WordSharePlugin;
import com.example.ainavigator.voice.WordVoicePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        registerPlugin(WordVoicePlugin.class);
        registerPlugin(WordDevicePlugin.class);
        registerPlugin(WordSharePlugin.class);
        super.onCreate(savedInstanceState);
    }}
}}
""",
        encoding="utf-8",
    )

    manifest = source / "AndroidManifest.xml"
    ET.register_namespace("android", ANDROID_NS)
    tree = ET.parse(manifest)
    root = tree.getroot()
    app = root.find("application")
    app.set(f"{{{ANDROID_NS}}}icon", "@mipmap/the_word_launcher")
    app.set(f"{{{ANDROID_NS}}}roundIcon", "@mipmap/the_word_launcher")
    app.find("activity").set(f"{{{ANDROID_NS}}}theme", "@style/TheWordLaunch")

    resources = source / "res"
    for directory, filename in (
        ("drawable", "the_word_mark.xml"),
        ("mipmap-anydpi-v26", "the_word_launcher.xml"),
        ("values", "the_word_styles.xml"),
    ):
        target = resources / directory
        target.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(overlay / filename, target / filename)
    styles = resources / "values/styles.xml"
    style_tree = ET.parse(styles)
    old_launch_style = style_tree.find("./style[@name='AppTheme.NoActionBarLaunch']")
    if old_launch_style is not None:
        style_tree.getroot().remove(old_launch_style)
        ET.indent(style_tree, space="    ")
        style_tree.write(styles, encoding="UTF-8", xml_declaration=True)
    for pattern in ("drawable*/splash.png", "drawable*/ic_launcher_*.xml", "mipmap-*/ic_launcher*.*"):
        for default in resources.glob(pattern):
            default.unlink()

    permissions = {element.get(ANDROID_NAME) for element in root.findall("uses-permission")}
    for permission in ("RECORD_AUDIO", "CAMERA"):
        name = f"android.permission.{permission}"
        if name not in permissions:
            ET.SubElement(root, "uses-permission", {ANDROID_NAME: name})

    queries = root.find("queries")
    if queries is None:
        queries = ET.SubElement(root, "queries")
    actions = {element.get(ANDROID_NAME) for element in queries.findall("intent/action")}
    for action in ("android.speech.RecognitionService", "android.intent.action.TTS_SERVICE"):
        if action not in actions:
            ET.SubElement(ET.SubElement(queries, "intent"), "action", {ANDROID_NAME: action})

    ET.indent(tree, space="    ")
    tree.write(manifest, encoding="UTF-8", xml_declaration=True)


if __name__ == "__main__":
    prepare_android(sys.argv[1] if len(sys.argv) > 1 else "com.example.ainavigator.test")
