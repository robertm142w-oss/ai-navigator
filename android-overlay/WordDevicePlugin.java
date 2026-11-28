package com.example.ainavigator.device;

import android.Manifest;
import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Intent;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.provider.MediaStore;
import android.os.Build;
import android.provider.CalendarContract;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "WordDevice",
    permissions = @Permission(alias = "camera", strings = {Manifest.permission.CAMERA})
)
public class WordDevicePlugin extends Plugin {
    private String activeTorch;

    @PluginMethod
    public void openCamera(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                releaseTorch();
                getActivity().startActivity(new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA));
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Could not open the phone's camera app.");
            }
        });
    }

    @PluginMethod
    public void memoryStatus(PluginCall call) {
        ActivityManager activityManager = getContext().getSystemService(ActivityManager.class);
        if (activityManager == null) {
            call.reject("Android memory status is unavailable.");
            return;
        }
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        activityManager.getMemoryInfo(memory);
        JSObject status = new JSObject();
        status.put("lowMemory", memory.lowMemory);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                String packageName = getContext().getPackageName();
                for (ApplicationExitInfo exit : activityManager.getHistoricalProcessExitReasons(packageName, 0, 10)) {
                    if (!packageName.equals(exit.getProcessName())) continue;
                    status.put("lastExitReason", exitReason(exit.getReason()));
                    status.put("lastExitTime", exit.getTimestamp());
                    break;
                }
            } catch (RuntimeException ignored) {
                // A missing history record should not prevent memory diagnostics.
            }
        }
        call.resolve(status);
    }

    private String exitReason(int reason) {
        switch (reason) {
            case ApplicationExitInfo.REASON_CRASH:
                return "Android recorded an app crash";
            case ApplicationExitInfo.REASON_CRASH_NATIVE:
                return "Android recorded a native crash";
            case ApplicationExitInfo.REASON_LOW_MEMORY:
                return "Android ended the process due to low memory";
            case ApplicationExitInfo.REASON_ANR:
                return "Android ended a nonresponsive app process";
            case ApplicationExitInfo.REASON_USER_REQUESTED:
                return "Android recorded a user-requested stop";
            case ApplicationExitInfo.REASON_EXIT_SELF:
                return "The app process exited";
            default:
                return "Android exit reason code " + reason;
        }
    }

    @PluginMethod
    public void draftCalendarEvent(PluginCall call) {
        String title = call.getString("title", "").trim();
        if (title.isEmpty() || title.length() > 120) {
            call.reject("Use an event title up to 120 characters.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent draft = new Intent(Intent.ACTION_INSERT, CalendarContract.Events.CONTENT_URI);
                draft.putExtra(CalendarContract.Events.TITLE, title);
                getActivity().startActivity(draft);
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("A calendar editor could not be opened.");
            }
        });
    }

    @PluginMethod
    public void setTorch(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!Boolean.TRUE.equals(call.getBoolean("enabled"))) {
                try {
                    releaseTorch();
                    call.resolve();
                } catch (RuntimeException error) {
                    call.reject("Could not switch the flashlight off.");
                }
                return;
            }
            if (getPermissionState("camera") == PermissionState.GRANTED) {
                enableTorch(call);
            } else {
                requestPermissionForAlias("camera", call, "onTorchPermission");
            }
        });
    }

    @PermissionCallback
    private void onTorchPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getPermissionState("camera") == PermissionState.GRANTED) enableTorch(call);
            else call.reject("Android camera permission is needed for flashlight control.");
        });
    }

    private CameraManager cameraManager() {
        return getContext().getSystemService(CameraManager.class);
    }

    private void enableTorch(PluginCall call) {
        try {
            CameraManager camera = cameraManager();
            for (String id : camera.getCameraIdList()) {
                CameraCharacteristics info = camera.getCameraCharacteristics(id);
                if (Boolean.TRUE.equals(info.get(CameraCharacteristics.FLASH_INFO_AVAILABLE))
                    && Integer.valueOf(CameraCharacteristics.LENS_FACING_BACK).equals(info.get(CameraCharacteristics.LENS_FACING))) {
                    camera.setTorchMode(id, true);
                    activeTorch = id;
                    call.resolve();
                    return;
                }
            }
            call.reject("No rear flashlight was found.");
        } catch (CameraAccessException | RuntimeException error) {
            call.reject("The flashlight is unavailable. Close any app using the camera and try again.");
        }
    }

    private void releaseTorch() {
        if (activeTorch == null) return;
        try {
            cameraManager().setTorchMode(activeTorch, false);
            activeTorch = null;
        } catch (CameraAccessException error) {
            throw new IllegalStateException(error);
        }
    }

    @Override
    protected void handleOnStop() {
        try {
            releaseTorch();
        } catch (RuntimeException ignored) {
            // Android releases the flashlight when the requesting process stops.
        }
    }
}
