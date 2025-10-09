# 🧠 Crowd Counting Portal – Smart Real-Time People Analytics

> A fully interactive **Crowd Counting & Zone Management Web Portal** built for **real-time monitoring**, **heatmap visualization**, and **automated alerts** using live video or uploaded footage.

![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-Framework-black.svg)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-AI%20Detection-orange.svg)
![Chart.js](https://img.shields.io/badge/Chart.js-Visualization-red.svg)
![MySQL](https://img.shields.io/badge/MySQL-Database-blue.svg)
![Infosys Internship](https://img.shields.io/badge/Infosys-Internship-0080FF.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

---

## 🌟 Overview

The **Crowd Counting Portal** is an AI-powered Flask web application designed to monitor people density in real-time using **video streams or uploads**.  
It provides zone-based analytics, heatmaps, and alerts to ensure better **safety, crowd management, and decision-making**.  

This project integrates **TensorFlow.js**, **Flask**, **MySQL**, and **Chart.js** into a single dynamic dashboard — making it an ideal AI + Web hybrid solution.

---

## 🚀 Key Features

### 🎥 Live Crowd Detection
- Real-time people detection using **TensorFlow.js (COCO-SSD)**.  
- Works with both **webcam** and **uploaded video** inputs.

### 🧩 Smart Zone Management
- Draw and label **custom zones** over video feed.  
- Zone data is stored and retrieved from **MySQL (JSON format)**.

### 📊 Real-Time Analytics Dashboard
- Displays **line and bar charts** using Chart.js.  
- Zone-wise count tracking, historical data logs, and trend analysis.

### ⚠️ Alert System
- Automatic alerts when density exceeds threshold.  
- Color-coded (🟢 Safe, 🟡 Moderate, 🔴 Danger) zones for instant awareness.

### 🔐 User Authentication
- Flask-based login & registration system.  
- Each user’s uploads, zones, and analytics are private and secure.

### 💎 Responsive UI Design
- Built using **HTML5, CSS3, and Vanilla JS**.  
- Lightweight, fast, and responsive across devices.

---

## 🗂️ Project Structure

```bash
CrowdCountingPortal/
│
├── app.py                # Flask backend (uploads, zones, alerts, DB)
│
├── templates/            # HTML templates
│   ├── index.html        # Main dashboard with video + zones
│   ├── graphs.html       # Real-time analytics dashboard
│   ├── alerts.html       # Threshold alert visualization
│   ├── login.html        # User login
│   ├── register.html     # User registration
│   └── my_uploads.html   # Manage uploaded videos
│
├── static/
│   ├── app.js            # Frontend logic (drawing, counting, heatmap)
│   └── style.css         # Responsive modern styles
│
├── uploads/              # User-uploaded video files
├── counts_log.csv        # Automatic crowd data log
├── zones.json            # Saved zone coordinates
└── README.md             # Project documentation
