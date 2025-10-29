# DBC to JSON Converter

This script converts DBC files to JSON format for use in the telemetry system.

## Requirements

```bash
pip install cantools
```

## Usage

```bash
python3 scripts/dbc-to-json/dbc-to-json.py AutoCtrl_V10_28.dbc dbc/vehicle.json
```

The output JSON file will contain:
- `messages`: Array of CAN message definitions with signals
- `valTables`: Value tables for signal enumeration mappings

## Output Format

```json
{
  "messages": [
    {
      "id": 320,
      "name": "VCU_Info1",
      "length": 8,
      "signals": [
        {
          "name": "VCU_VehSpeed",
          "startBit": 19,
          "length": 12,
          "factor": 0.05,
          "offset": 0,
          "min": 0,
          "max": 200,
          "unit": "km/h",
          "endianness": "big"
        }
      ]
    }
  ],
  "valTables": {
    "VCU_Mode": {
      "0": "Init Mode",
      "1": "Standby Mode"
    }
  }
}

