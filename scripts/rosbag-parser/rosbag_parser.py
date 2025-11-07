#!/usr/bin/env python3
"""
ROS Bag Parser
Parse ROS bag files and extract messages to JSON format.
"""

import json
import sys
import os
import argparse
import base64
from pathlib import Path
from datetime import datetime

try:
    import rosbag
except ImportError:
    print("Error: rosbag library not installed.")
    print("Install with: pip install rospkg")
    print("Or install ROS Noetic: http://wiki.ros.org/noetic/Installation")
    sys.exit(1)


def ros_time_to_timestamp(ros_time):
    """Convert ROS time to milliseconds timestamp."""
    if hasattr(ros_time, 'secs'):
        return int(ros_time.secs * 1000 + ros_time.nsecs / 1000000)
    elif isinstance(ros_time, dict):
        return int(ros_time.get('secs', 0) * 1000 + ros_time.get('nsecs', 0) / 1000000)
    else:
        return int(float(ros_time) * 1000)


def message_to_dict(msg):
    """Convert ROS message to dictionary."""
    if isinstance(msg, bytes):
        return {'_type': 'bytes', '_data': base64.b64encode(msg).decode('utf-8')}
    
    if hasattr(msg, '__slots__'):
        result = {}
        for slot in msg.__slots__:
            value = getattr(msg, slot)
            if isinstance(value, bytes):
                result[slot] = {'_type': 'bytes', '_data': base64.b64encode(value).decode('utf-8')}
            elif hasattr(value, '__slots__'):
                result[slot] = message_to_dict(value)
            elif isinstance(value, list):
                result[slot] = [message_to_dict(item) if hasattr(item, '__slots__') or isinstance(item, bytes) else item for item in value]
            else:
                result[slot] = value
        return result
    elif isinstance(msg, dict):
        return {k: message_to_dict(v) if isinstance(v, (dict, list, bytes)) or hasattr(v, '__slots__') else v 
                for k, v in msg.items()}
    elif isinstance(msg, list):
        return [message_to_dict(item) if hasattr(item, '__slots__') or isinstance(item, (dict, bytes)) else item 
                for item in msg]
    else:
        return msg


def parse_bag_info(bag_path):
    """Get bag file information."""
    bag = rosbag.Bag(bag_path, 'r')
    info = {
        'path': bag_path,
        'version': bag.version,
        'duration': bag.get_end_time() - bag.get_start_time(),
        'start_time': bag.get_start_time(),
        'end_time': bag.get_end_time(),
        'size': os.path.getsize(bag_path),
        'topics': {}
    }
    
    topic_info = bag.get_type_and_topic_info()[1]
    for topic in topic_info:
        topic_data = topic_info[topic]
        msg_type = topic_data.msg_type
        msg_count = topic_data.message_count
        connection_count = topic_data.connections
        
        info['topics'][topic] = {
            'message_type': msg_type,
            'message_count': msg_count,
            'connection_count': connection_count
        }
    
    bag.close()
    return info


def extract_topic(bag_path, topic_name, output_path=None, start_time=None, end_time=None):
    """Extract messages from a specific topic."""
    bag = rosbag.Bag(bag_path, 'r')
    messages = []
    
    start_time_ros = bag.get_start_time() if start_time is None else start_time
    end_time_ros = bag.get_end_time() if end_time is None else end_time
    
    for topic, msg, t in bag.read_messages(
        topics=[topic_name],
        start_time=rosbag.rostime.Time.from_sec(start_time_ros) if start_time else None,
        end_time=rosbag.rostime.Time.from_sec(end_time_ros) if end_time else None
    ):
        timestamp = ros_time_to_timestamp(t)
        msg_dict = message_to_dict(msg)
        messages.append({
            'timestamp': timestamp,
            'topic': topic,
            'message': msg_dict
        })
    
    bag.close()
    
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)
        print(f"Extracted {len(messages)} messages from {topic_name} to {output_path}")
    
    return messages


def extract_all_topics(bag_path, output_dir, topics=None, start_time=None, end_time=None):
    """Extract messages from all or specified topics."""
    bag = rosbag.Bag(bag_path, 'r')
    
    if topics is None:
        topics = list(bag.get_type_and_topic_info()[1].keys())
    
    os.makedirs(output_dir, exist_ok=True)
    
    for topic in topics:
        print(f"Processing topic: {topic}")
        topic_name_safe = topic.replace('/', '_').replace('~', '_')
        output_path = os.path.join(output_dir, f"{topic_name_safe}.json")
        
        messages = []
        start_time_ros = bag.get_start_time() if start_time is None else start_time
        end_time_ros = bag.get_end_time() if end_time is None else end_time
        
        for topic_name, msg, t in bag.read_messages(
            topics=[topic],
            start_time=rosbag.rostime.Time.from_sec(start_time_ros) if start_time else None,
            end_time=rosbag.rostime.Time.from_sec(end_time_ros) if end_time else None
        ):
            timestamp = ros_time_to_timestamp(t)
            msg_dict = message_to_dict(msg)
            messages.append({
                'timestamp': timestamp,
                'message': msg_dict
            })
        
        if messages:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(messages, f, indent=2, ensure_ascii=False)
            print(f"  -> Extracted {len(messages)} messages to {output_path}")
        else:
            print(f"  -> No messages found")
    
    bag.close()


def extract_navsatfix_to_gps(bag_path, output_path):
    """Extract NavSatFix messages and convert to GPS points format."""
    bag = rosbag.Bag(bag_path, 'r')
    gps_points = []
    
    for topic, msg, t in bag.read_messages(topics=['/chcnav_fix_demo/fix']):
        timestamp = ros_time_to_timestamp(t)
        if hasattr(msg, 'latitude') and hasattr(msg, 'longitude'):
            gps_points.append({
                'timestamp': timestamp,
                'latitude': msg.latitude,
                'longitude': msg.longitude,
                'altitude': getattr(msg, 'altitude', 0.0),
                'status': {
                    'status': getattr(msg.status, 'status', -1) if hasattr(msg, 'status') else -1,
                    'service': getattr(msg.status, 'service', 0) if hasattr(msg, 'status') else 0
                } if hasattr(msg, 'status') else {}
            })
    
    bag.close()
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(gps_points, f, indent=2, ensure_ascii=False)
    
    print(f"Extracted {len(gps_points)} GPS points to {output_path}")
    return gps_points


def main():
    parser = argparse.ArgumentParser(description='Parse ROS bag files')
    parser.add_argument('bag_file', help='Path to ROS bag file')
    parser.add_argument('--info', action='store_true', help='Show bag file information')
    parser.add_argument('--topic', help='Extract specific topic')
    parser.add_argument('--all-topics', action='store_true', help='Extract all topics')
    parser.add_argument('--output', '-o', help='Output file or directory')
    parser.add_argument('--gps', action='store_true', help='Extract GPS points from NavSatFix')
    parser.add_argument('--start-time', type=float, help='Start time (seconds from bag start)')
    parser.add_argument('--end-time', type=float, help='End time (seconds from bag start)')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.bag_file):
        print(f"Error: Bag file not found: {args.bag_file}")
        sys.exit(1)
    
    if args.info:
        info = parse_bag_info(args.bag_file)
        print("\n=== Bag File Information ===")
        print(f"Path: {info['path']}")
        print(f"Version: {info['version']}")
        print(f"Duration: {info['duration']:.2f} seconds")
        print(f"Start: {datetime.fromtimestamp(info['start_time'])}")
        print(f"End: {datetime.fromtimestamp(info['end_time'])}")
        print(f"Size: {info['size'] / (1024**3):.2f} GB")
        print(f"\nTopics ({len(info['topics'])}):")
        for topic, details in info['topics'].items():
            print(f"  {topic}")
            print(f"    Type: {details['message_type']}")
            print(f"    Messages: {details['message_count']}")
        return
    
    if args.gps:
        output_path = args.output or 'gps_points.json'
        extract_navsatfix_to_gps(args.bag_file, output_path)
        return
    
    if args.topic:
        output_path = args.output or f"{args.topic.replace('/', '_')}.json"
        extract_topic(args.bag_file, args.topic, output_path, args.start_time, args.end_time)
        return
    
    if args.all_topics:
        output_dir = args.output or 'bag_output'
        extract_all_topics(args.bag_file, output_dir, start_time=args.start_time, end_time=args.end_time)
        return
    
    # Default: show info
    info = parse_bag_info(args.bag_file)
    print("\n=== Bag File Information ===")
    print(f"Path: {info['path']}")
    print(f"Duration: {info['duration']:.2f} seconds")
    print(f"Size: {info['size'] / (1024**3):.2f} GB")
    print(f"\nTopics ({len(info['topics'])}):")
    for topic in info['topics'].keys():
        print(f"  {topic}")


if __name__ == '__main__':
    main()

