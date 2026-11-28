package com.example.ainavigator.share;

import android.content.ActivityNotFoundException;
import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WordShare")
public class WordSharePlugin extends Plugin {
    private static final int MAX_TEXT_LENGTH = 16_000;

    @PluginMethod
    public void open(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty() || text.length() > MAX_TEXT_LENGTH) {
            call.reject("There is no shareable text or the reply is too long.", "INVALID_TEXT");
            return;
        }
        getActivity().runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, text);
            try {
                getActivity().startActivity(Intent.createChooser(send, null));
                call.resolve();
            } catch (ActivityNotFoundException error) {
                call.reject("The Android share sheet is unavailable.", "UNAVAILABLE");
            }
        });
    }
}
