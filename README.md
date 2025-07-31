# Health-monitoring-system-with-biometric-sensors-and-data-recording
IoT Health Monitoring System – A real-time health tracking system using ESP32 sensors and a web dashboard. It monitors body temperature, motion (falls), and ambient conditions, sending alerts and storing data for remote access and analysis.
 # 🩺 IoT Health Monitoring System

A real-time health monitoring system using biometric sensors, ESP32 microcontrollers, and a web dashboard. The system collects biometric data (temperature, motion, ambient conditions), analyzes it, stores it remotely, and displays health status using an LCD and RGB LED.

---

## 📌 Overview

This project is designed to:
- Monitor a user's health in real time
- Detect anomalies such as high body temperature or falls
- Display information locally (LCD, LED )
- Store and analyze data remotely via a server and database
- Provide a web interface for live data visualization and manual control

---

## 🧰 Components

### 🔹 ESP32 - Sensor Node 1
- Body Temperature Sensor (DS18B20)
- Motion Sensor (MPU6050)
- Ambient Temperature Sensor (NTC analog)
- LCD Display (16x2 I2C)

### 🔹 ESP32 - Actuator Node 2
- RGB LED (Health status indicator: green = normal, red = alert)
- 7-Segment Display (Body temperature display)
- Analog Joystick (Navigation and parameter adjustment)

### 🔹 Raspberry Pi - Central Node
- MQTT Broker (e.g. Mosquitto)
- Data forwarding to remote server via HTTP

### 🔹 Remote Server
- REST API to receive and manage data
- MySQL or Firebase database for data storage

### 🔹 Web Interface
- Real-time dashboard for sensor data visualization
- Remote control for system settings and actuators

---

## ⚙️ How It Works

1. **Data Collection (ESP32 Node 1)**  
   - Collects body temperature, motion activity (e.g. fall), and ambient temperature  
   - Sends data via MQTT to the Raspberry Pi  
   - Displays current health status on LCD and RGB LED  



2. **Storage (Server)**  
   - Receives data via REST API  
   - Stores data in MySQL or Firebase for analysis and historical access  

3. **Web Dashboard**  
   - Displays live sensor data using real-time charts  
   - Allows users to adjust thresholds and control actuators (LED, display) remotely  
   - Provides access to health reports and system status

---

## 🚨 Example Use Cases

- Detects a fall → Sends alert and turns RGB LED red  
- Detects high body temperature → Displays alert and updates web dashboard  
- Allows users to adjust thresholds and view health reports through the web interface

---

## 🛠 Technologies Used

| Component        | Technology                         |
|------------------|------------------------------------|
| ESP32            | Arduino / MQTT                     |
| Backend Server   | REST API / MySQL or Firebase       |
| Frontend         | HTML / CSS / JavaScript / Chart.js |
| Communication    | MQTT and HTTP                      |
| Other            | Python / Node.js / Mosquitto       |


---
