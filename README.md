# Amin Secure Folder

A browser-based file organizer with local file storage and same-network AShare transfers.

## Run the app

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

## Share files between devices on the same Wi-Fi/LAN

AShare needs the LAN server so the two browsers can find each other. On the computer hosting the app, run:

```sh
npm run lan
```

This builds the app and starts a local server. Open the `http://...` network address printed in the terminal on both devices. In AShare, choose **Receive** on one device and share its temporary code with the sender; on the other device choose **Send**, enter the code, choose one file, and send it. The receiver saves incoming files into that browser's local file library. Codes expire after 10 minutes and accept one sender.

Each transferred file is limited to 20 MiB. The server binds to all network interfaces so devices on the same Wi-Fi/LAN can connect. Use only a trusted private network: the local HTTP/WebSocket transfer is not end-to-end encrypted, and the browser cannot identify or confirm the Wi-Fi network name. Stop the server when sharing is finished.

Files saved in the browser library use IndexedDB and remain on that device/browser; they are not cloud-synced. AShare is a temporary direct relay through the hosting computer, not a cloud-storage service.

## Checks

```sh
npm run build
npm run lint
```
