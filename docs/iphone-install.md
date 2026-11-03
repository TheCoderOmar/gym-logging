# Install Gym Log on your iPhone

Gym Log runs on your PC. The iPhone app is a home-screen app that works **offline at the gym** and syncs with the PC when you're back on home Wi-Fi.

It takes about 10 minutes, once. You need:

- the PC and the iPhone on the **same Wi-Fi**
- Node 22.13+ on the PC (Gym Log already running there)
- Python with Pillow, only for step 3 (`python -m pip install pillow`)

iOS only installs offline web apps over **https**, so the first steps give your PC its own small certificate that only your iPhone trusts.

---

## On the PC

### 1. Find the PC's address

Open PowerShell and run `ipconfig`. Under your Wi-Fi (or Ethernet) adapter, note the **IPv4 Address**, for example `192.168.1.2`.

Below, replace `<PC-IP>` with that address.

### 2. Make the certificate (once)

In the Gym Log folder:

```
node scripts/make-cert.js
```

This creates a `certs/` folder (it stays on your PC and is never committed). Run it again if the PC's address ever changes.

### 3. Make the phone-sized animations (optional, once)

```
python scripts/make-mobile-media.py
```

This writes small exercise animations (about 57 MB) to `mobile-media/`. The phone downloads them after its first sync. Without this step everything works, just without animations on the phone.

### 4. Start Gym Log so the phone can reach it

```
$env:HOST="0.0.0.0"; npm.cmd start
```

(The **Gym Log** desktop shortcut already does this.) The window shows a line like `iPhone app: https://0.0.0.0:3443/m`.

If Windows asks whether Node.js may use the network, tick **Private networks** and choose **Allow**.

---

## On the iPhone

### 5. Download the certificate

Open **Safari** (it must be Safari) and go to:

```
http://<PC-IP>:3000/m/ca.crt
```

Safari says *"This website is trying to download a configuration profile."* Tap **Allow**, then **Close**.

### 6. Install it

Open **Settings**. Near the top, tap **Profile Downloaded** (or go to **General › VPN & Device Management** and tap **Gym Log local**).

Tap **Install**, enter your passcode, then **Install** again and **Done**.

### 7. Trust it

Go to **Settings › General › About**, scroll to the bottom and tap **Certificate Trust Settings**.

Turn on **Gym Log local** and tap **Continue**.

> Installing (step 6) is not enough. If this switch is off, the app can't connect.

### 8. Add the app to your Home Screen

In Safari, open:

```
https://<PC-IP>:3443/m/
```

It should load with no warning. Then tap the **Share** button › **Add to Home Screen**, make sure **Open as Web App** is on, and tap **Add**.

> Add it from exactly this page. An icon added from any other Gym Log page opens in Safari instead of as an app, and won't work offline.

### 9. First sync

Open **Gym Log** from the new Home Screen icon (not from Safari) and tap **Sync**. It loads your exercises, workouts and recovery map, then the animations in the background.

Done. From now on, always open it from the icon.

---

## Everyday use

- **At the gym:** log workouts and sports as usual. No connection needed; everything waits on the phone.
- **At home:** with Gym Log running on the PC, open the app and tap **Sync**. Phone workouts go to the PC, and the phone gets a fresh copy of everything.
- Workouts you finish on the phone can still be edited there ("Edit workout"); the edit replaces the PC copy on the next sync.

## Getting updates

After Gym Log is updated on the PC: restart it on the PC, open the iPhone app on home Wi-Fi, close it fully (swipe it away), and open it again.

---

## Troubleshooting

**Sync says "Can't reach your PC"**

Check these in order:

1. The PC app was started with `HOST=0.0.0.0` (step 4). A plain `npm start` only listens to the PC itself.
2. The iPhone still trusts the certificate: **Settings › General › About › Certificate Trust Settings › Gym Log local** is on. If it's on and it still fails, delete the profile (**General › VPN & Device Management › Gym Log local › Remove Profile**) and repeat steps 5–7.
3. Both devices are on the same Wi-Fi (not mobile data, not a guest network).
4. Windows Firewall allows Node.js on private networks.

**The PC's address changed**

Run `node scripts/make-cert.js` again, restart Gym Log, then repeat steps 5–8 on the iPhone (remove the old profile first).

**Safari says "This connection is not private"**

The certificate isn't trusted yet: do step 7. If you just re-made the certificate, remove the old profile and repeat steps 5–7.

**The icon opens in Safari, not as an app**

It was added from the wrong page. Delete the icon and redo step 8 from `https://<PC-IP>:3443/m/`.

**No animations on the phone**

Run step 3 on the PC, then sync again on home Wi-Fi.
