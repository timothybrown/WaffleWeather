#!/usr/bin/env python3
"""Publish a test weather observation to MQTT for end-to-end testing.

Usage:
    python scripts/mqtt-test-publish.py [--broker localhost] [--port 1883]
"""

import argparse
import json
import time

import paho.mqtt.client as mqtt


def main():
    parser = argparse.ArgumentParser(description="Publish test weather data to MQTT")
    parser.add_argument("--broker", default="localhost", help="MQTT broker host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--device-id", default="test-station-001", help="Device ID for topic")
    args = parser.parse_args()

    # Simulate a realistic ecowitt2mqtt JSON payload (metric units)
    payload = {
        "temp": 22.3,
        "tempin": 24.1,
        "dewpoint": 14.5,
        "feelslike": 22.0,
        "heatindex": 22.5,
        "windchill": 21.8,
        "humidity": 62.0,
        "humidityin": 48.0,
        "baromabs": 1013.25,
        "baromrel": 1015.8,
        "windspeed": 12.5,
        "windgust": 18.3,
        "winddir": 225.0,
        "rainrate": 0.0,
        "dailyrain": 2.4,
        "weeklyrain": 15.6,
        "monthlyrain": 42.8,
        "yearlyrain": 312.5,
        "eventrain": 0.0,
        "solarradiation": 456.7,
        "uv": 5.2,
    }

    topic = f"ecowitt2mqtt/{args.device_id}"
    message = json.dumps(payload)

    client = mqtt.Client()
    client.connect(args.broker, args.port)
    result = client.publish(topic, message, retain=True)
    result.wait_for_publish()
    client.disconnect()

    print(f"Published to {topic}:")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
