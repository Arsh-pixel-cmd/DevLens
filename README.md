# 🔮 DevLens Ultra

**The Ultimate Browser Extension for Frontend Engineers.**  
*Reverse-engineer design systems, extract clean React code, and debut production animations—all in one click.*

![DevLens Hero](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white) 
![React](https://img.shields.io/badge/React-Extraction-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind-Mapper-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

---

## 🚀 Overview

**DevLens Ultra** is not just another color picker. It's a professional-grade engineering tool built to dissect modern web applications. It uses advanced **DOM Analysis**, **Network Sniffing**, and **Heuristic Scanning** to reveal the DNA of any website.

Built with performance in mind, it operates inside a **Shadow DOM** to ensure zero CSS bleed, uses `requestIdleCallback` for non-blocking analysis, and leverages **Manifest V3** for security and longevity.

## ✨ Advanced Features

### 1. ⚛️ Component Ripper (The Killer Feature)
Stop guessing how a UI component was built.
*   **Inspector Mode**: Hover & click any element on the page.
*   **Code Generation**: Instantly extracts a clean **React Component**.
*   **Tailwind Mapper**: Automatically converts computed styles (px, rgb) into nearest **Tailwind CSS classes** (e.g., `p-4`, `bg-blue-500`, `rounded-lg`).
*   **Smart Cleaning**: Filters out 300+ browser default styles to give you only the code that matters.

### 2. 🕵️‍♂️ Tech & API Sniffer
Go beyond the frontend. DevLens monitors network traffic (XHR/Fetch) in real-time.
*   **Stack Detection**: Identifies frameworks (Next.js, Vue, Nuxt) and libraries (GSAP, Framer Motion).
*   **Backend Recon**: Detects API signatures from major providers like **Supabase**, **Firebase**, **Stripe**, **Algolia**, and **Contentful**.

### 3. ⏳ Animation Time-Machine
Debug complex micro-interactions with precision.
*   **Time Warp**: Global slider to slow down the entire website to **0.1x speed**.
*   **Bezier Thief**: Extracts and visualizes distinct `cubic-bezier` curves used in CSS transitions.

### 4. 🎨 Intelligent Design System
*   **Smart Palette**: Uses HSL clustering to group colors into **Primary**, **Secondary**, and **Grays** automatically.
*   **Typography Scanner**: Captures font stacks, weights, and computed sizes.

### 5. 👻 Pixel-Perfect Ops
*   **Ghost Overlay**: Upload a Figma export/mockup.
*   **Visual Diff**: Overlay it on the live site with adaptable opacity to verify implementation accuracy.

---

## 🛠 Engineering Deep Dive

For the recruiters and engineers curious about the implementation:

*   **Manifest V3 Architecture**: Built on the latest Web Extension standard using Service Workers and strict CSP.
*   **Shadow DOM Isolation**: The entire UI lives inside `attachShadow({mode: 'open'})`. The extension's styles **never** conflict with the host site.
*   **Main World Injection**: Bypasses extension isolation sandbox to read global window variables (`window.React`, `window.__NEXT_DATA__`) and proxy network requests.
*   **Performance First**: Heavy scanning tasks are chunked and scheduled during browser idle time to maintain 60FPS scrolling.
*   **Security**: HTML sanitization and safe DOM APIs prevent XSS when rendering scanned content.

---

## 📦 Installation

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer Mode** (top right toggle).
4.  Click **Load unpacked**.
5.  Select the **DevLens** folder.
6.  Pin the extension and visit any website!

---

## 🎮 How to Use

1.  **Zero-Config Scan**: Just click the extension icon. The page will auto-scroll to wake up lazy-loaded assets.
2.  **Rip a Component**: Go to the **Tools** tab → Click **Inspect Component** → Click any UI element. Copy the code from the **Export** tab.
3.  **Debug Motion**: Go to **Tools** → Drag the **Time Warp** slider.

---

<div align="center">
  <i>Built with ❤️ by Arsh. Defining the future of Developer Tooling.</i>
</div>
