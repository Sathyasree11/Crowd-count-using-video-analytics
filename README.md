
# Crowd Counting Portal – Smart Real-Time People Analytics


A fully interactive **Crowd Counting & Zone Management Web Portal** designed for **real-time monitoring**, **heatmap visualization**, and **automated alerts** using live video or uploaded footage.

---

##  Key Features
<img width="1317" height="858" alt="Image" src="https://github.com/user-attachments/assets/2f627c3f-64e7-4629-aaf6-563f1e2aa7cc" />

 **Live Crowd Detection**
- Uses `TensorFlow.js` and `COCO-SSD` for person detection in real time.  
- Works with both **uploaded videos** and **webcam input**.  

 **Smart Zone Management**
- Draw multiple custom zones directly on the video feed.  
- Save zones as JSON and persist them in MySQL.  

 **Real-Time Analytics Dashboard**
- Line and bar charts for live population trends using `Chart.js`.  
- Zone-based count tracking and automatic CSV logging.  

 **Alert System**
- Instant alerts when crowd density exceeds threshold limits.  
- Color-coded danger indicators for quick decision-making.  

 **User Authentication**
- Simple login/register system using Flask sessions and MySQL.  
- Each user’s uploads and data are managed securely.  

 **Beautiful UI + Responsive Design**
- Clean interface built with pure HTML/CSS and dynamic JavaScript.  
- Focus on clarity, usability, and minimalistic design.

---

##  Project Structure

CrowdCountingPortal/

│── app.py # Flask backend (upload, zones, DB, alerts, etc.)

│── templates/ # HTML templates

│ ├── index.html # Main dashboard with video + zones

│ ├── graphs.html # Real-time analytics with Chart.js

│ ├── alerts.html # Threshold alert visualization

│ ├── login.html # User login

│ ├── register.html # User registration

│ └── my_uploads.html # Manage uploaded videos

│── static/

│ ├── app.js # Frontend logic (drawing, counting, heatmap)

│ └── style.css # Modern responsive styles

│── uploads/ # User-uploaded video files

│── counts_log.csv # Automatic crowd log file

│── zones.json # Saved zone coordinates

---

##  Technology Stack

| Component | Technology |
|------------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (Vanilla JS), Chart.js |
| **Detection** | TensorFlow.js + COCO-SSD |
| **Backend** | Flask (Python) |
| **Database** | MySQL (pymysql connector) |
| **Data Logging** | CSV + MySQL tables |
| **Visualization** | Chart.js (Line, Bar graphs)|

---

##  How It Works

1. **Login/Register**  
   Create a user account and log in.

2. **Upload or Stream Video**  
   Choose a pre-recorded video or use your webcam for live monitoring.

3. **Draw Zones**  
   Select areas of interest (like gates, corridors, rooms) to track people density.

4. **Start Detection**  
   AI model identifies people in real time and counts how many are inside each zone.

5. **Live Dashboard**  
   See graphs and alerts update instantly as people move through zones.

6. **Data Export**  
   Download logs as CSV for reports or analytics.

---

##  System Architecture

Video Input → Object Detection (TensorFlow.js)
↓
Zone Mapping → Count Calculation
↓
Flask Backend → MySQL Storage + CSV Log
↓
Visualization → Graphs, Alerts, Heatmap (Frontend)


---


##  Database Schema Overview

### 1. `users`
| id | username | password_hash | created_at |
|----|-----------|----------------|-------------|

### 2. `videos`
| id | user_id | filename | size_bytes | created_at |

### 3. `video_zones`
| id | video_id | zone_id | label | coordinates |

### 4. `zone_counts`
| id | video_id | zone_id | ts | label | current | peak |

---

## Installation & Setup

###  Prerequisites
- Python 3.8+
- MySQL Server
- Node.js (optional, for frontend tweaking)

###  Setup Steps

```bash
# Clone the repo
git clone https://github.com/yourusername/CrowdCountingPortal.git
cd CrowdCountingPortal

# Create virtual environment
python -m venv venv
venv\Scripts\activate    # (Windows)
source venv/bin/activate # (Mac/Linux)

# Install dependencies
pip install flask pymysql

# Configure MySQL (create database and update DB_CONFIG in app.py)

# Run the Flask app
python app.py

# Open browser
http://127.0.0.1:5000/
