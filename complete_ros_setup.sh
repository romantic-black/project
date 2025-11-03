#!/bin/bash
# Complete ROS Noetic setup after installation

echo "=== Completing ROS Noetic Setup ==="
echo ""

# Step 1: Install rosdep command and build tools
echo "Step 1: Installing rosdep and build dependencies..."
sudo apt install -y python3-rosdep python3-rosinstall python3-rosinstall-generator python3-wstool build-essential

# Step 2: Initialize rosdep
echo "Step 2: Initializing rosdep..."
source /opt/ros/noetic/setup.bash
if [ ! -d /etc/ros/rosdep/sources.list.d ]; then
    sudo rosdep init
else
    echo "rosdep already initialized, skipping..."
fi

# Step 3: Update rosdep
echo "Step 3: Updating rosdep database..."
rosdep update

# Step 4: Setup environment variables in .bashrc
echo "Step 4: Setting up environment variables..."
if ! grep -q "source /opt/ros/noetic/setup.bash" ~/.bashrc; then
    echo "" >> ~/.bashrc
    echo "# ROS Noetic setup" >> ~/.bashrc
    echo "source /opt/ros/noetic/setup.bash" >> ~/.bashrc
    echo "Environment variables added to ~/.bashrc"
else
    echo "ROS environment already configured in ~/.bashrc"
fi

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "To use ROS Noetic, run:"
echo "  source /opt/ros/noetic/setup.bash"
echo ""
echo "Or start a new terminal session (environment is in ~/.bashrc)"
echo ""
echo "To verify installation, run:"
echo "  roscore"




