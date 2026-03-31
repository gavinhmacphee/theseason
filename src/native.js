// ============================================
// TEAM SEASON — Native Capacitor Utilities
// Wraps all Capacitor plugins with web fallbacks
// ============================================

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Share } from "@capacitor/share";
import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";

export const isNative = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === "ios";
export const isAndroid = Capacitor.getPlatform() === "android";

// --- HAPTICS ---

export async function hapticImpact(style = "medium") {
  if (!isNative) return;
  try {
    const styles = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: styles[style] || ImpactStyle.Medium });
  } catch {}
}

export async function hapticNotification(type = "success") {
  if (!isNative) return;
  try {
    const types = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error };
    await Haptics.notification({ type: types[type] || NotificationType.Success });
  } catch {}
}

export async function hapticSelection() {
  if (!isNative) return;
  try {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch {}
}

// --- CAMERA ---

export async function takePhoto() {
  if (!isNative) return null;
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      width: 1200,
      height: 1200,
      correctOrientation: true,
    });
    return photo;
  } catch {
    return null;
  }
}

export async function pickPhoto() {
  if (!isNative) return null;
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      width: 1200,
      height: 1200,
      correctOrientation: true,
    });
    return photo;
  } catch {
    return null;
  }
}

// Convert Capacitor photo URI to a File object for upload
export async function photoToFile(photo) {
  if (!photo?.webPath) return null;
  try {
    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    const ext = photo.format === "png" ? "png" : "jpg";
    return new File([blob], `photo.${ext}`, { type: `image/${ext}` });
  } catch {
    return null;
  }
}

// --- SHARE ---

export async function nativeShare({ title, text, url, files }) {
  if (!isNative) {
    // Fall back to Web Share API
    if (navigator.canShare) {
      try {
        await navigator.share({ title, text, url, files });
        return true;
      } catch { return false; }
    }
    return false;
  }
  try {
    await Share.share({ title, text, url, dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}

// --- STATUS BAR ---

export async function configureStatusBar() {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: StatusBarStyle.Light });
    if (isAndroid) {
      await StatusBar.setBackgroundColor({ color: "#1B4332" });
    }
  } catch {}
}

export async function setStatusBarLight() {
  if (!isNative) return;
  try { await StatusBar.setStyle({ style: StatusBarStyle.Light }); } catch {}
}

export async function setStatusBarDark() {
  if (!isNative) return;
  try { await StatusBar.setStyle({ style: StatusBarStyle.Dark }); } catch {}
}

// --- KEYBOARD ---

export function setupKeyboard(onShow, onHide) {
  if (!isNative) return () => {};
  const showListener = Keyboard.addListener("keyboardWillShow", (info) => {
    onShow?.(info.keyboardHeight);
  });
  const hideListener = Keyboard.addListener("keyboardWillHide", () => {
    onHide?.();
  });
  return () => {
    showListener.then((l) => l.remove());
    hideListener.then((l) => l.remove());
  };
}

// --- LOCAL NOTIFICATIONS ---

export async function requestNotificationPermission() {
  if (!isNative) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === "granted";
  } catch { return false; }
}

export async function scheduleGameReminder({ id, title, body, scheduleAt }) {
  if (!isNative) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title,
        body,
        schedule: { at: scheduleAt },
        sound: "default",
        actionTypeId: "GAME_REMINDER",
        extra: { type: "game_reminder" },
      }],
    });
  } catch {}
}

export async function scheduleEntryNudge({ id, title, body, scheduleAt }) {
  if (!isNative) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title,
        body,
        schedule: { at: scheduleAt },
        sound: "default",
        actionTypeId: "ENTRY_NUDGE",
        extra: { type: "entry_nudge" },
      }],
    });
  } catch {}
}

export async function cancelAllNotifications() {
  if (!isNative) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }
  } catch {}
}

export async function scheduleGameDayReminders(schedule, teamName, sportEmoji) {
  if (!isNative) return;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    // Cancel existing reminders before rescheduling
    await cancelAllNotifications();

    const now = new Date();
    const upcoming = schedule
      .filter((g) => new Date(g.date) > now)
      .slice(0, 20); // Max 20 upcoming

    for (let i = 0; i < upcoming.length; i++) {
      const game = upcoming[i];
      const gameDate = new Date(game.date);

      // Morning-of reminder (9 AM on game day)
      const morningOf = new Date(gameDate);
      morningOf.setHours(9, 0, 0, 0);
      if (morningOf > now) {
        await scheduleGameReminder({
          id: 1000 + i,
          title: `${sportEmoji} Game Day!`,
          body: game.opponent
            ? `${teamName} vs ${game.opponent} today${game.location ? ` at ${game.location}` : ""}`
            : `${teamName} has a game today!`,
          scheduleAt: morningOf,
        });
      }

      // Post-game nudge (8 PM on game day)
      const evening = new Date(gameDate);
      evening.setHours(20, 0, 0, 0);
      if (evening > now) {
        await scheduleEntryNudge({
          id: 2000 + i,
          title: "How did it go?",
          body: `Tap to log today's ${game.opponent ? `game vs ${game.opponent}` : "game"} before you forget`,
          scheduleAt: evening,
        });
      }
    }
  } catch {}
}

// --- APP LIFECYCLE ---

export function onAppStateChange(callback) {
  if (!isNative) return () => {};
  const listener = App.addListener("appStateChange", callback);
  return () => listener.then((l) => l.remove());
}

export function onBackButton(callback) {
  if (!isNative) return () => {};
  const listener = App.addListener("backButton", callback);
  return () => listener.then((l) => l.remove());
}
