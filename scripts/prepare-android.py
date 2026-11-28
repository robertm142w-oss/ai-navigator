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

    plugin = source / "java/com/example/ainavigator/voice"
    plugin.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "android-overlay/WordVoicePlugin.java", plugin / "WordVoicePlugin.java")
    activity.write_text(
        f"""package {app_id};

import android.os.Bundle;
import com.example.ainavigator.voice.WordVoicePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        registerPlugin(WordVoicePlugin.class);
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
    permissions = {element.get(ANDROID_NAME) for element in root.findall("uses-permission")}
    for permission in ("RECORD_AUDIO", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"):
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
