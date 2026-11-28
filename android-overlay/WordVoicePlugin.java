package com.example.ainavigator.voice;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(
    name = "WordVoice",
    permissions = @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO})
)
public class WordVoicePlugin extends Plugin {
    private static final int LISTEN_TIMEOUT_MS = 25_000;
    private static final int SPEAK_TIMEOUT_MS = 60_000;
    private static final int MAX_REPLY_LENGTH = 600;

    private final Handler main = new Handler(Looper.getMainLooper());
    private PluginCall listeningCall;
    private RecognitionSession recognition;
    private SpeechRecognizer recognizer;
    private PluginCall speakingCall;
    private TextToSpeech speech;
    private Runnable speechTimeout;
    private String utteranceId;
    private int speechGeneration;
    private boolean speechReady;

    @PluginMethod
    public void listen(PluginCall call) {
        main.post(() -> {
            if (listeningCall != null) {
                call.reject("The microphone is already active.", "BUSY");
                return;
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                !SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                call.reject("On-device dictation is unavailable. Type your command.", "OFFLINE_UNAVAILABLE");
                return;
            }
            finishSpeech("Speech interrupted by the microphone.", "CANCELLED");
            listeningCall = call;
            if (getPermissionState("microphone") == PermissionState.GRANTED) {
                startRecognition(call);
            } else {
                requestPermissionForAlias("microphone", call, "microphonePermission");
            }
        });
    }

    @PermissionCallback
    private void microphonePermission(PluginCall call) {
        main.post(() -> {
            if (listeningCall != call) return;
            if (getPermissionState("microphone") != PermissionState.GRANTED) {
                finishRecognition(null, "Microphone permission was declined. Type your command.", "PERMISSION_DENIED");
                return;
            }
            startRecognition(call);
        });
    }

    private void startRecognition(PluginCall call) {
        try {
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            recognition = new RecognitionSession();
            recognizer.setRecognitionListener(recognition);
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, requestedLocale(call).toLanguageTag());
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
            main.postDelayed(recognition.timeout, LISTEN_TIMEOUT_MS);
        } catch (RuntimeException error) {
            finishRecognition(null, "On-device dictation could not start. Type your command.", "OFFLINE_UNAVAILABLE");
        }
    }

    private final class RecognitionSession implements RecognitionListener {
        private final Runnable timeout = () -> {
            if (recognition == this) finishRecognition(null, "No command received. Try again or type it.", "TIMEOUT");
        };

        @Override
        public void onResults(Bundle results) {
            if (recognition != this) return;
            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            String text = matches == null || matches.isEmpty() ? "" : matches.get(0).trim();
            if (text.isEmpty()) {
                finishRecognition(null, "No command was understood. Try again or type it.", "NO_MATCH");
            } else {
                finishRecognition(text, null, null);
            }
        }

        @Override
        public void onError(int error) {
            if (recognition != this) return;
            switch (error) {
                case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
                case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                    finishRecognition(null, "This speech language is unavailable offline. Type your command.", "LANGUAGE_UNAVAILABLE");
                    break;
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    finishRecognition(null, "No command was understood. Try again or type it.", "NO_MATCH");
                    break;
                default:
                    finishRecognition(null, "On-device dictation stopped. Try again or type your command.", "RECOGNITION_FAILED");
            }
        }

        @Override public void onReadyForSpeech(Bundle parameters) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rms) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onPartialResults(Bundle results) {}
        @Override public void onEvent(int type, Bundle parameters) {}
    }

    private void finishRecognition(String text, String message, String code) {
        if (recognition != null) main.removeCallbacks(recognition.timeout);
        recognition = null;
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        PluginCall call = listeningCall;
        listeningCall = null;
        if (call == null) return;
        if (text == null) {
            call.reject(message, code);
            return;
        }
        JSObject response = new JSObject();
        response.put("text", text);
        call.resolve(response);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        main.post(() -> {
            String text = call.getString("text", "").trim();
            if (text.isEmpty()) {
                call.reject("There is no text to read.", "EMPTY_TEXT");
                return;
            }
            if (listeningCall != null) {
                call.reject("Wait for the microphone to finish.", "BUSY");
                return;
            }
            finishSpeech("This reply was replaced.", "CANCELLED");
            speakingCall = call;
            speechTimeout = () -> {
                if (speakingCall != call) return;
                finishSpeech("The speech engine timed out.", "TIMEOUT");
                releaseSpeech();
            };
            main.postDelayed(speechTimeout, SPEAK_TIMEOUT_MS);
            if (speechReady) {
                startSpeech(call);
            } else if (speech == null) {
                int generation = ++speechGeneration;
                speech = new TextToSpeech(getContext(), status -> main.post(() -> onSpeechReady(generation, status)));
            }
        });
    }

    private void onSpeechReady(int generation, int status) {
        if (generation != speechGeneration) return;
        if (status != TextToSpeech.SUCCESS) {
            finishSpeech("The Android speech engine is unavailable.", "OFFLINE_UNAVAILABLE");
            releaseSpeech();
            return;
        }
        speechReady = true;
        speech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { postSpeechResult(id, null); }
            @Override public void onError(String id) { postSpeechResult(id, "The offline voice could not speak."); }
            @Override public void onStop(String id, boolean interrupted) { postSpeechResult(id, "Speech was interrupted."); }
        });
        if (speakingCall != null) startSpeech(speakingCall);
    }

    private void postSpeechResult(String id, String message) {
        main.post(() -> {
            if (id.equals(utteranceId)) finishSpeech(message, "SPEECH_FAILED");
        });
    }

    private void startSpeech(PluginCall call) {
        Voice voice = embeddedVoice(requestedLocale(call), speech.getVoices());
        if (voice == null || speech.setVoice(voice) != TextToSpeech.SUCCESS) {
            finishSpeech("An installed offline voice was not available for this language.", "LANGUAGE_UNAVAILABLE");
            return;
        }
        speech.setSpeechRate(0.93f);
        utteranceId = java.util.UUID.randomUUID().toString();
        String text = call.getString("text", "").trim();
        int limit = Math.min(MAX_REPLY_LENGTH, TextToSpeech.getMaxSpeechInputLength());
        if (text.length() > limit) {
            int end = limit - 1;
            if (Character.isHighSurrogate(text.charAt(end - 1))) end--;
            text = text.substring(0, end).trim() + "…";
        }
        if (speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId) != TextToSpeech.SUCCESS) {
            finishSpeech("The offline voice could not speak.", "SPEECH_FAILED");
        }
    }

    private Voice embeddedVoice(Locale locale, Set<Voice> voices) {
        if (voices == null) return null;
        Voice bestVoice = null;
        int bestScore = Integer.MIN_VALUE;
        for (Voice voice : voices) {
            if (voice.isNetworkConnectionRequired() ||
                !voice.getLocale().getLanguage().equals(locale.getLanguage()) ||
                (voice.getFeatures() != null &&
                    voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) continue;
            int score = voice.getQuality() - voice.getLatency() / 2;
            if (locale.getCountry().equals(voice.getLocale().getCountry())) score += 1000;
            if (score > bestScore) {
                bestScore = score;
                bestVoice = voice;
            }
        }
        return bestVoice;
    }

    private Locale requestedLocale(PluginCall call) {
        String language = call.getString("language", "");
        Locale locale = Locale.forLanguageTag(language);
        return locale.getLanguage().isEmpty() ? Locale.getDefault() : locale;
    }

    private void finishSpeech(String message, String code) {
        if (speechTimeout != null) main.removeCallbacks(speechTimeout);
        speechTimeout = null;
        utteranceId = null;
        PluginCall call = speakingCall;
        speakingCall = null;
        if (call == null) return;
        if (message == null) {
            call.resolve();
        } else {
            if (speechReady) speech.stop();
            call.reject(message, code);
        }
    }

    private void releaseSpeech() {
        speechGeneration++;
        speechReady = false;
        if (speech != null) {
            speech.shutdown();
            speech = null;
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            cancelVoice();
            call.resolve();
        });
    }

    private void cancelVoice() {
        finishRecognition(null, "Listening stopped.", "CANCELLED");
        finishSpeech("Speech stopped.", "CANCELLED");
        releaseSpeech();
    }

    @Override
    protected void handleOnStop() {
        cancelVoice();
    }

    @Override
    protected void handleOnDestroy() {
        cancelVoice();
    }
}
