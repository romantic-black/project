#!/usr/bin/env python3
"""
DBC to JSON converter
Converts a DBC file to a structured JSON format for the telemetry system.
"""

import json
import sys
import os
from pathlib import Path

try:
    import cantools
except ImportError:
    print("Error: cantools library not installed. Install with: pip install cantools")
    sys.exit(1)


def parse_dbc(dbc_path: str) -> dict:
    """Parse DBC file and convert to JSON structure."""
    db = cantools.database.load_file(dbc_path)
    
    messages = []
    val_tables = {}
    
    for message in db.messages:
        signals = []
        
        for signal in message.signals:
            sig_def = {
                "name": signal.name,
                "startBit": signal.start,
                "length": signal.length,
                "factor": signal.scale if signal.scale else 1,
                "offset": signal.offset if signal.offset else 0,
                "unit": signal.unit if signal.unit else "",
                "endianness": "big" if signal.byte_order == "big_endian" else "little",
            }
            
            if signal.minimum is not None:
                sig_def["min"] = signal.minimum
            if signal.maximum is not None:
                sig_def["max"] = signal.maximum
            
            if signal.choices:
                val_table = {}
                for choice_val, choice_name in signal.choices.items():
                    val_table[int(choice_val)] = str(choice_name)
                sig_def["valTable"] = val_table
                val_tables[signal.name] = val_table
            
            comment = signal.comment
            if comment:
                sig_def["comment"] = comment
            
            signals.append(sig_def)
        
        msg_def = {
            "id": message.frame_id,
            "name": message.name,
            "length": message.length,
            "signals": signals,
        }
        
        if message.senders:
            msg_def["sender"] = message.senders[0]
        
        cycle_time = message.cycle_time
        if cycle_time:
            msg_def["cycleTime"] = cycle_time
        
        messages.append(msg_def)
    
    return {
        "messages": messages,
        "valTables": val_tables,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: dbc-to-json.py <input.dbc> [output.json]")
        sys.exit(1)
    
    dbc_path = sys.argv[1]
    if not os.path.exists(dbc_path):
        print(f"Error: DBC file not found: {dbc_path}")
        sys.exit(1)
    
    output_path = sys.argv[2] if len(sys.argv) > 2 else "vehicle.json"
    
    print(f"Parsing DBC file: {dbc_path}")
    data = parse_dbc(dbc_path)
    
    output_dir = Path(output_path).parent
    if output_dir and not output_dir.exists():
        output_dir.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"Successfully converted DBC to JSON: {output_path}")
    print(f"Found {len(data['messages'])} messages")


if __name__ == "__main__":
    main()

