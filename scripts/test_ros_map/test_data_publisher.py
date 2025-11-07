#!/usr/bin/env python3
"""
ROS Test Data Publisher
Publishes data from bag file to ROS topics for testing the map integration.
"""

import sys
import os
import argparse
import time
import json
import math
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

try:
    import rospy
    from nav_msgs.msg import Odometry, Path
    from geometry_msgs.msg import PoseStamped, PointStamped
    from sensor_msgs.msg import NavSatFix, PointCloud2
    from std_msgs.msg import Header
    import rosbag
except ImportError as e:
    print(f"Error: ROS libraries not found: {e}")
    print("Please ensure ROS Noetic is installed and sourced:")
    print("  source /opt/ros/noetic/setup.bash")
    sys.exit(1)


class TestDataPublisher:
    def __init__(self, bag_path, rate=10.0, use_lidar_as_terrain=False):
        self.bag_path = bag_path
        self.rate = rate
        self.bag = None
        self.use_lidar_as_terrain = use_lidar_as_terrain
        
        # Publishers
        self.state_pub = None
        self.gps_pub = None
        self.path_pub = None
        self.terrain_pub = None
        
        # Path history for generating trajectory
        self.path_history = []
        
        # Topic mapping configuration
        # Bag file topics -> Output topics
        self.topic_mapping = {
            '/chcnav/devpvt': '/state_estimation',  # Convert to Odometry
            '/chcnav_fix_demo/fix': '/chcnav_fix_demo/fix',  # Direct forward
            '/lidar_points': '/terrain_map' if use_lidar_as_terrain else None,  # Optional terrain map
        }
        
    def setup(self):
        """Initialize ROS node and publishers."""
        rospy.init_node('test_data_publisher', anonymous=True)
        
        # Publishers
        self.state_pub = rospy.Publisher('/state_estimation', Odometry, queue_size=10)
        self.gps_pub = rospy.Publisher('/chcnav_fix_demo/fix', NavSatFix, queue_size=10)
        self.path_pub = rospy.Publisher('/path', Path, queue_size=10)
        
        # Optional: terrain map publisher
        if self.use_lidar_as_terrain:
            self.terrain_pub = rospy.Publisher('/terrain_map', PointCloud2, queue_size=10)
        
        print("Publishers initialized:")
        print("  /state_estimation (nav_msgs/Odometry) <- from /chcnav/devpvt")
        print("  /chcnav_fix_demo/fix (sensor_msgs/NavSatFix) <- direct forward")
        print("  /path (nav_msgs/Path) <- generated from position history")
        if self.use_lidar_as_terrain:
            print("  /terrain_map (sensor_msgs/PointCloud2) <- from /lidar_points")
        
    def convert_devpvt_to_odometry(self, devpvt_msg, timestamp):
        """Convert chcnav/devpvt message to nav_msgs/Odometry."""
        odom = Odometry()
        
        # Header
        odom.header = Header()
        odom.header.stamp = rospy.Time.from_sec(timestamp)
        odom.header.frame_id = "map"
        odom.child_frame_id = "base_link"
        
        # Position (convert from GPS to map coordinates - simplified)
        # In real system, this would use proper coordinate transformation
        # For testing, we'll use GPS coordinates directly as map coordinates
        odom.pose.pose.position.x = devpvt_msg.get('longitude', 0.0) * 111320.0  # Approximate conversion
        odom.pose.pose.position.y = devpvt_msg.get('latitude', 0.0) * 111320.0
        odom.pose.pose.position.z = devpvt_msg.get('altitude', 0.0)
        
        # Orientation (from roll, pitch, yaw)
        # Convert Euler angles to quaternion
        roll = devpvt_msg.get('roll', 0.0)
        pitch = devpvt_msg.get('pitch', 0.0)
        yaw = devpvt_msg.get('yaw', 0.0)
        
        # Quaternion conversion
        cy = math.cos(yaw * 0.5)
        sy = math.sin(yaw * 0.5)
        cp = math.cos(pitch * 0.5)
        sp = math.sin(pitch * 0.5)
        cr = math.cos(roll * 0.5)
        sr = math.sin(roll * 0.5)
        
        odom.pose.pose.orientation.w = cr * cp * cy + sr * sp * sy
        odom.pose.pose.orientation.x = sr * cp * cy - cr * sp * sy
        odom.pose.pose.orientation.y = cr * sp * cy + sr * cp * sy
        odom.pose.pose.orientation.z = cr * cp * sy - sr * sp * cy
        
        # Velocity
        enu_vel = devpvt_msg.get('enu_velocity', {})
        odom.twist.twist.linear.x = enu_vel.get('x', 0.0)
        odom.twist.twist.linear.y = enu_vel.get('y', 0.0)
        odom.twist.twist.linear.z = enu_vel.get('z', 0.0)
        
        vehicle_ang_vel = devpvt_msg.get('vehicle_angular_velocity', {})
        odom.twist.twist.angular.x = vehicle_ang_vel.get('x', 0.0)
        odom.twist.twist.angular.y = vehicle_ang_vel.get('y', 0.0)
        odom.twist.twist.angular.z = vehicle_ang_vel.get('z', 0.0)
        
        return odom
    
    def convert_to_navsatfix(self, msg_dict, timestamp):
        """Convert message dict to NavSatFix."""
        navsat = NavSatFix()
        
        navsat.header = Header()
        navsat.header.stamp = rospy.Time.from_sec(timestamp)
        navsat.header.frame_id = "gps"
        
        navsat.latitude = msg_dict.get('latitude', 0.0)
        navsat.longitude = msg_dict.get('longitude', 0.0)
        navsat.altitude = msg_dict.get('altitude', 0.0)
        
        # Status
        status = msg_dict.get('status', {})
        if isinstance(status, dict):
            navsat.status.status = status.get('status', -1)
            navsat.status.service = status.get('service', 0)
        
        return navsat
    
    def generate_path(self):
        """Generate path from position history."""
        if len(self.path_history) < 2:
            return None
        
        path = Path()
        path.header = Header()
        path.header.stamp = rospy.Time.now()
        path.header.frame_id = "map"
        
        # Use recent positions (last 100 points or all if less)
        recent_points = self.path_history[-100:]
        
        for pos in recent_points:
            pose_stamped = PoseStamped()
            pose_stamped.header = Header()
            pose_stamped.header.stamp = rospy.Time.from_sec(pos['timestamp'])
            pose_stamped.header.frame_id = "map"
            
            pose_stamped.pose.position.x = pos['x']
            pose_stamped.pose.position.y = pos['y']
            pose_stamped.pose.position.z = pos.get('z', 0.0)
            
            # Use orientation from odometry if available
            if 'orientation' in pos:
                pose_stamped.pose.orientation = pos['orientation']
            else:
                pose_stamped.pose.orientation.w = 1.0
            
            path.poses.append(pose_stamped)
        
        return path
    
    def publish_data(self):
        """Read bag file and publish data."""
        print(f"Opening bag file: {self.bag_path}")
        self.bag = rosbag.Bag(self.bag_path, 'r')
        
        bag_start_time = self.bag.get_start_time()
        rate_obj = rospy.Rate(self.rate)
        
        print(f"Bag duration: {self.bag.get_end_time() - bag_start_time:.2f} seconds")
        print(f"Publishing at {self.rate} Hz")
        print("Press Ctrl+C to stop...")
        
        try:
            # Read messages in order
            for topic, msg, t in self.bag.read_messages():
                if rospy.is_shutdown():
                    break
                
                current_time = t.to_sec()
                relative_time = current_time - bag_start_time
                
                # Publish GPS data
                if topic == '/chcnav_fix_demo/fix':
                    try:
                        # Direct conversion from ROS message
                        navsat = NavSatFix()
                        navsat.header = Header()
                        navsat.header.stamp = t
                        navsat.header.frame_id = getattr(msg, 'header', Header()).frame_id if hasattr(msg, 'header') else "gps"
                        
                        navsat.latitude = getattr(msg, 'latitude', 0.0)
                        navsat.longitude = getattr(msg, 'longitude', 0.0)
                        navsat.altitude = getattr(msg, 'altitude', 0.0)
                        
                        if hasattr(msg, 'status'):
                            navsat.status.status = getattr(msg.status, 'status', -1)
                            navsat.status.service = getattr(msg.status, 'service', 0)
                        
                        self.gps_pub.publish(navsat)
                    except Exception as e:
                        print(f"Error publishing GPS: {e}")
                        import traceback
                        traceback.print_exc()
                
                # Convert and publish state estimation
                elif topic == '/chcnav/devpvt':
                    try:
                        # Extract data from ROS message
                        msg_dict = {}
                        if hasattr(msg, '__slots__'):
                            for slot in msg.__slots__:
                                try:
                                    value = getattr(msg, slot)
                                    if not hasattr(value, '__slots__') and not isinstance(value, (list, dict)):
                                        msg_dict[slot] = value
                                    elif hasattr(value, '__slots__'):
                                        # Extract nested values
                                        nested = {}
                                        for nested_slot in value.__slots__:
                                            try:
                                                nested_value = getattr(value, nested_slot)
                                                if not hasattr(nested_value, '__slots__'):
                                                    nested[nested_slot] = nested_value
                                            except:
                                                pass
                                        msg_dict[slot] = nested
                                except:
                                    pass
                        
                        odom = self.convert_devpvt_to_odometry(msg_dict, current_time)
                        self.state_pub.publish(odom)
                        
                        # Add to path history
                        self.path_history.append({
                            'timestamp': current_time,
                            'x': odom.pose.pose.position.x,
                            'y': odom.pose.pose.position.y,
                            'z': odom.pose.pose.position.z,
                            'orientation': odom.pose.pose.orientation,
                        })
                        
                        # Generate and publish path periodically
                        if len(self.path_history) % 10 == 0:
                            path = self.generate_path()
                            if path:
                                self.path_pub.publish(path)
                    except Exception as e:
                        print(f"Error publishing state: {e}")
                        import traceback
                        traceback.print_exc()
                
                # Publish terrain map from lidar points (optional)
                if self.use_lidar_as_terrain and topic == '/lidar_points':
                    try:
                        # Direct forward point cloud as terrain map
                        if self.terrain_pub:
                            self.terrain_pub.publish(msg)
                    except Exception as e:
                        print(f"Error publishing terrain map: {e}")
                
                # Control rate
                rate_obj.sleep()
                
        except KeyboardInterrupt:
            print("\nStopped by user")
        finally:
            if self.bag:
                self.bag.close()
            print("Bag file closed")
    
    def message_to_dict(self, msg):
        """Convert ROS message to dictionary."""
        if hasattr(msg, '__slots__'):
            result = {}
            for slot in msg.__slots__:
                try:
                    value = getattr(msg, slot)
                    if hasattr(value, '__slots__'):
                        result[slot] = self.message_to_dict(value)
                    elif isinstance(value, list):
                        result[slot] = [
                            self.message_to_dict(item) if hasattr(item, '__slots__') else item 
                            for item in value
                        ]
                    else:
                        result[slot] = value
                except Exception as e:
                    # Skip attributes that can't be accessed
                    continue
            return result
        elif isinstance(msg, dict):
            return msg
        else:
            # For primitive types, return as-is
            return msg


def main():
    parser = argparse.ArgumentParser(
        description='Publish bag file data to ROS topics for testing',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Topic Mapping:
  /chcnav/devpvt          -> /state_estimation (converted to nav_msgs/Odometry)
  /chcnav_fix_demo/fix    -> /chcnav_fix_demo/fix (direct forward)
  /lidar_points           -> /terrain_map (if --terrain-map enabled)
  Position history        -> /path (generated trajectory)

Note: Bag file may not contain all required topics. This script handles:
  - Missing /state_estimation: converts from /chcnav/devpvt
  - Missing /path: generates from position history
  - Missing /terrain_map: can use /lidar_points (optional)
        """
    )
    parser.add_argument('--bag', required=True, help='Path to bag file')
    parser.add_argument('--rate', type=float, default=10.0, help='Publishing rate (Hz)')
    parser.add_argument('--terrain-map', action='store_true', 
                       help='Publish /lidar_points as /terrain_map')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.bag):
        print(f"Error: Bag file not found: {args.bag}")
        sys.exit(1)
    
    try:
        publisher = TestDataPublisher(args.bag, args.rate, use_lidar_as_terrain=args.terrain_map)
        publisher.setup()
        publisher.publish_data()
    except rospy.ROSInterruptException:
        pass
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

