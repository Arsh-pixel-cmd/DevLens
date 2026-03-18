# 🔮 DevLens Ultra

**The Ultimate Browser Extension for Frontend Engineers.**  
*Reverse-engineer design systems, extract clean React code, and dissect production components—all in one click.*

[![GitHub Star](https://img.shields.io/github/stars/Arsh-pixel-cmd/DevLens?style=social)](https://github.com/Arsh-pixel-cmd/DevLens)
![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white) 
![React](https://img.shields.io/badge/React-Extraction-61DAFB?style=for-the-badge&logo=react&logoColor=black)

---

## 🚀 Overview

**DevLens Ultra** is a professional-grade engineering tool built to dissect modern web applications It is **Figma + DevTools + Code Generator**. It uses advanced **DOM Analysis**, **System 4 IR Scanning**, and **Heuristic Pattern Detection** to reveal the DNA of any website.

Built with performance in mind, it operates inside a **Shadow DOM** to ensure zero CSS bleed and leverages **Manifest V3 Service Workers** for non-blocking network analysis.

## ✨ Advanced Features

### ⚛️ 1. Component Ripper (System 4 Engine)
- **Zero-Noise Codegen**: Extracts clean, production-ready React components.
- **Tailwind Mapper**: Automatically converts computed styles into the nearest Tailwind CSS classes.
- **Abstract Mode**: Uses AI to refactor raw DOM into logical, reusable sub-components.

### 🧠 2. AI Insight Fusion
- **Universal LLM Support**: Connect to OpenAI, Groq, Ollama, or OpenRouter.
- **AI Explain**: Highlight any element to get a 3-sentence technical breakdown of its layout, logic, and purpose.
- **Auto-Correction**: AI handles malformed JSON and optimizes JSX structure on the fly.

### 🕵️‍♂️ 3. Framework & API Sniffer
- **Stack Detection**: Identifies frameworks (Next.js, React, Vue) and libraries.
- **Data Hooking**: Directly reads framework state like `__NEXT_DATA__` or React Fiber props.

### 🎨 4. Modern Figma-Style UI
- **Draggable & Minimizable**: Floating sidebar that can be dragged anywhere or minimized to a sleek "D" icon.
- **Glassmorphism Design**: High-end UI that stays out of your way.

---

## 🛠 Architecture & Flow

For deep-dive exploration, the codebase follow a "Triple-Layer" architecture:

1.  **The Shadow Host (Injector)**: Encapsulates the UI in a Shadow DOM. Bypasses site-wide CSP to load styles and scripts safely.
2.  **The Scanning Worker**: Offloads heavy DOM-to-IR calculations to a background thread to prevent UI jank.
3.  **The Service Worker (Background)**: Handles secure network requests, AI streaming, and long-running job management.

---

## 📦 Getting Started

1.  **Clone the Repo**: `git clone https://github.com/Arsh-pixel-cmd/DevLens.git`
2.  **Load in Chrome**: 
    - Go to `chrome://extensions`.
    - Enable **Developer Mode**.
    - Click **Load unpacked** and select the `src` folder.
3.  **Configure AI**:
    - Open the extension → Go to **Codegen** tab.
    - Enter your API Key and Base URL.
    - Click **Save Configuration**.

## 🎮 How to Use

- **Inspect**: Click **Select Element** and click any part of a website.
- **Insights**: Switch to the **Insights** tab to see React Fiber data or click **AI Explain**.
- **Generate**: Go to **Codegen** → **Compile Selection**. Copy the JSX or refine it via the code editor.
- **Minimize**: Use the `-` icon to shrink DevLens into a floating shortcut.

---

<div align="center">
  <p><b>Support the project! ⭐ Star the repo on <a href="https://github.com/Arsh-pixel-cmd/DevLens">GitHub</a></b></p>
  <i>Built with ❤️ by Arsh. Defining the future of Developer Tooling.</i>
</div>
