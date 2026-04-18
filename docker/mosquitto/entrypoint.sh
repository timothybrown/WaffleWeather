#!/bin/sh
set -e

PASSWD_FILE="/mosquitto/config/passwd"

if [ ! -f "$PASSWD_FILE" ]; then
    if [ -z "$WW_MQTT_USERNAME" ] || [ -z "$WW_MQTT_PASSWORD" ]; then
        echo "ERROR: WW_MQTT_USERNAME and WW_MQTT_PASSWORD must be set" >&2
        exit 1
    fi
    mosquitto_passwd -b -c "$PASSWD_FILE" "$WW_MQTT_USERNAME" "$WW_MQTT_PASSWORD"
    chown mosquitto:mosquitto "$PASSWD_FILE"
    echo "Created Mosquitto password file for user: $WW_MQTT_USERNAME"
fi

exec mosquitto -c /mosquitto/config/mosquitto.conf
