# reTerminal E1001 - E-ink Departure Board

This guide explains how to flash your Seeed Studio reTerminal E1001 to display real-time public transport departures.

## Overview

The E1001 is an ESP32-S3 based device with a 7.5" 800x480 e-ink display. When configured with this ESPHome firmware, it will:

1. Wake from deep sleep
2. Connect to WiFi
3. Fetch a pre-rendered departure board image from your Vercel deployment
4. Display the image using partial refresh (fast, low-power)
5. Return to deep sleep

This cycle repeats every 60 seconds by default, giving you near-real-time departure information while preserving battery life.

## Prerequisites

- Seeed Studio reTerminal E1001 connected to WiFi
- ESPHome installed (`pip install esphome`)
- Your Next Departure deployment URL (e.g., `https://next-departure.vercel.app`)
- Stop IDs for the stops you want to display

## Finding Your Stop IDs

### Melbourne (PTV)

1. Visit your deployed Next Departure app
2. Use the Settings panel to search for stops
3. The stop ID is shown in the URL or can be found in the PTV data

Common Melbourne stop ID formats:
- Tram stops: 4-digit numbers (e.g., `2070` for Melbourne Central)
- Train stations: 5-digit numbers (e.g., `19854` for Flinders Street)
- Bus stops: 5-digit numbers

## Configuration

1. Copy `reterminal-e1001.yaml` to your ESPHome config directory

2. Edit the substitutions section:

```yaml
substitutions:
  # Your WiFi credentials
  wifi_ssid: "YOUR_WIFI_SSID"
  wifi_password: "YOUR_WIFI_PASSWORD"

  # Your departure board URL
  # Single stop:
  board_url: "https://next-departure.vercel.app/api/og/board?stops=tram:2070&mono=true"

  # Multiple stops (comma-separated):
  # board_url: "https://next-departure.vercel.app/api/og/board?stops=tram:2070,train:19854&mono=true"

  # Refresh interval (default 60 seconds)
  sleep_duration: "60s"
```

### URL Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `stops` | required | Comma-separated `mode:stopId` pairs |
| `mono` | false | Pure B/W mode for 1-bit e-ink (recommended) |
| `width` | 800 | Image width in pixels |
| `height` | 480 | Image height in pixels |
| `limit` | 3 | Max departures per stop |
| `maxMinutes` | 30 | Time window in minutes |
| `showAbsolute` | false | Show HH:MM instead of "Xm" |
| `orientation` | landscape | `landscape` or `portrait` |

## Flashing

### First-time Flash (USB)

1. Connect the E1001 to your computer via USB-C

2. Put the device in download mode:
   - Hold the BOOT button
   - Press and release the RESET button
   - Release the BOOT button

3. Flash the firmware:
   ```bash
   esphome run reterminal-e1001.yaml
   ```

4. Select the USB serial port when prompted

### Over-the-Air Updates

After the initial flash, you can update wirelessly:

```bash
esphome run reterminal-e1001.yaml
```

Select the device's IP address or mDNS name when prompted.

## Power Consumption

| State | Current | Duration |
|-------|---------|----------|
| Deep Sleep | ~10µA | 60 seconds |
| WiFi Connect | ~100mA | ~5 seconds |
| Image Download | ~100mA | ~5 seconds |
| Display Update | ~30mA | ~3 seconds |
| **Average** | **~2mA** | - |

With the 2000mAh battery, expect approximately **3-4 weeks** of battery life with 60-second refresh intervals.

### Extending Battery Life

For longer battery life, increase the refresh interval:

```yaml
sleep_duration: "120s"   # 2 minutes - ~6-8 weeks battery
sleep_duration: "300s"   # 5 minutes - ~3+ months battery
```

Note: Longer intervals mean departure times may be slightly stale. For a departure board, 60-120 seconds is recommended for a good balance.

## Troubleshooting

### Display shows "Loading..."

- Check WiFi credentials
- Verify the board URL is accessible from your network
- Check ESPHome logs: `esphome logs reterminal-e1001.yaml`

### Image appears inverted or corrupted

The E1001's busy pin must be inverted. If you have display issues, verify:

```yaml
busy_pin:
  number: GPIO13
  inverted: true  # CRITICAL
```

### Ghosting on display

Reduce the full refresh interval:

```yaml
full_refresh_every: "10"  # More frequent full refreshes
```

### Device won't wake from sleep

Press the right white button (GPIO4) to force wake, or check that `wakeup_pin` is configured correctly.

## Hardware Reference

### GPIO Pinout (E1001)

| Function | GPIO | Notes |
|----------|------|-------|
| SPI CLK | GPIO7 | Display clock |
| SPI MOSI | GPIO9 | Display data |
| CS | GPIO10 | Display chip select |
| DC | GPIO11 | Display data/command |
| RST | GPIO12 | Display reset |
| BUSY | GPIO13 | Display busy (inverted!) |
| Wake Button | GPIO4 | Right white button |
| Battery ADC | GPIO1 | Battery voltage (via divider) |
| Battery Enable | GPIO21 | Must be HIGH to read battery |
| Status LED | GPIO46 | Blue LED |
| I2C SDA | GPIO19 | For sensors |
| I2C SCL | GPIO20 | For sensors |

### Display Specifications

- Size: 7.5 inches
- Resolution: 800 x 480 pixels
- Colors: Black and White (1-bit)
- Refresh: Supports partial refresh
- Model: Waveshare 7.5" V2 (7.50inv2p driver)

## Advanced Configuration

### Home Assistant Integration

The ESPHome configuration includes sensors that can be monitored in Home Assistant:

- Battery Voltage
- Battery Level (percentage)
- WiFi Signal Strength

To enable Home Assistant API, add to the YAML:

```yaml
api:
  encryption:
    key: "your-encryption-key"
```

### Custom Wake Schedule

For different refresh rates at different times, you can use Home Assistant automations to control the device via the API.

## Support

For issues with:
- **Next Departure app**: Create an issue on the GitHub repository
- **ESPHome**: See [ESPHome documentation](https://esphome.io)
- **E1001 hardware**: See [Seeed Wiki](https://wiki.seeedstudio.com/getting_started_with_reterminal_e1001/)
