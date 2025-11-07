#!/bin/bash
# Quick test script for ROS map integration
# This script helps set up the testing environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BAG_FILE="$PROJECT_ROOT/data/zhineng/shiwai_2025-11-03-11-12-36.bag"

echo "=== ROS Map Integration Test Setup ==="
echo ""

# Check ROS installation
if ! command -v roscore &> /dev/null; then
    echo "❌ ROS not found. Please install ROS Noetic first:"
    echo "   sudo sh $PROJECT_ROOT/install_ros_noetic.sh"
    exit 1
fi

# Check rosbridge installation
if ! rosrun rosbridge_server rosbridge_websocket.py --help &> /dev/null; then
    echo "⚠️  rosbridge_server not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y ros-noetic-rosbridge-suite
fi

# Check bag file
if [ ! -f "$BAG_FILE" ]; then
    echo "❌ Bag file not found: $BAG_FILE"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""
echo "=== Test Instructions ==="
echo ""
echo "1. Start ROS master (in Terminal 1):"
echo "   source /opt/ros/noetic/setup.bash"
echo "   roscore"
echo ""
echo "2. Start rosbridge (in Terminal 2):"
echo "   source /opt/ros/noetic/setup.bash"
echo "   roslaunch rosbridge_server rosbridge_websocket.launch port:=9090"
echo ""
echo "3. Start test data publisher (in Terminal 3):"
echo "   source /opt/ros/noetic/setup.bash"
echo "   cd $PROJECT_ROOT"
echo "   python3 scripts/test_ros_map/test_data_publisher.py --bag $BAG_FILE --rate 10"
echo ""
echo "4. Start web application (in Terminal 4):"
echo "   cd $PROJECT_ROOT"
echo "   export VITE_ROS_BRIDGE_URL=ws://localhost:9090"
echo "   pnpm --filter web dev"
echo ""
echo "5. Open browser and navigate to: http://localhost:5173"
echo ""
echo "For detailed test procedures, see: docs/test_ros_map.md"
echo ""


