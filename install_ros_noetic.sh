#!/bin/bash
# ROS Noetic Desktop-Full Installation Script

set -e

echo "=== ROS Noetic Desktop-Full Installation ==="
echo ""

# Step 1: Setup keys first (needed before configuring sources)
echo "Step 1: Setting up ROS GPG keys..."
if [ ! -f /usr/share/keyrings/ros-archive-keyring.gpg ]; then
    # Download key directly using curl (most reliable for WSL environments)
    echo "Downloading ROS GPG key..."
    curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc | sudo gpg --dearmor -o /usr/share/keyrings/ros-archive-keyring.gpg
    
    if [ -f /usr/share/keyrings/ros-archive-keyring.gpg ]; then
        echo "Key added successfully using curl method"
    else
        echo "Error: Failed to add GPG key"
        exit 1
    fi
else
    echo "Key already exists, skipping..."
fi

# Step 2: Configure apt sources
echo "Step 2: Configuring ROS apt sources..."
sudo sh -c 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros/ubuntu $(lsb_release -sc) main" > /etc/apt/sources.list.d/ros-latest.list'

# Step 3: Update apt
echo "Step 3: Updating apt package list..."
sudo apt update

# Step 4: Install ROS Noetic Desktop-Full and rosdep
echo "Step 4: Installing ROS Noetic Desktop-Full and rosdep (this may take a while)..."
sudo apt install -y ros-noetic-desktop-full python3-rosdep

# Step 5: Initialize rosdep
echo "Step 5: Initializing rosdep..."
# Source ROS environment to make rosdep available
source /opt/ros/noetic/setup.bash
if [ ! -d /etc/ros/rosdep/sources.list.d ]; then
    sudo rosdep init
else
    echo "rosdep already initialized, skipping..."
fi
rosdep update

# Step 6: Setup environment
echo "Step 6: Setting up environment variables..."
if ! grep -q "source /opt/ros/noetic/setup.bash" ~/.bashrc; then
    echo "" >> ~/.bashrc
    echo "# ROS Noetic setup" >> ~/.bashrc
    echo "source /opt/ros/noetic/setup.bash" >> ~/.bashrc
    echo "source ~/.bashrc"
    echo "Environment variables added to ~/.bashrc"
else
    echo "ROS environment already configured in ~/.bashrc"
fi

# Step 7: Install dependencies for building packages
echo "Step 7: Installing build dependencies..."
sudo apt install -y python3-rosinstall python3-rosinstall-generator python3-wstool build-essential

echo ""
echo "=== Installation Complete! ==="
echo ""
echo "To use ROS Noetic, run:"
echo "  source /opt/ros/noetic/setup.bash"
echo ""
echo "Or start a new terminal session (environment is in ~/.bashrc)"
echo ""
echo "To verify installation, run:"
echo "  roscore"

