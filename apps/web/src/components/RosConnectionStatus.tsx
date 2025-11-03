import { useMapStore } from '../stores/map';

export default function RosConnectionStatus() {
  const {
    rosConnectionStatus,
    rosBridgeUrl,
    rosError,
    topicStatuses,
  } = useMapStore();

  const getStatusColor = () => {
    switch (rosConnectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (rosConnectionStatus) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中';
      case 'error':
        return '连接失败';
      default:
        return '未连接';
    }
  };

  const topics = Array.from(topicStatuses.values());
  const topicsWithData = topics.filter((t) => t.hasData).length;

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-3">ROS连接状态</h3>
      
      <div className="space-y-3">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="text-sm">{getStatusText()}</span>
        </div>

        {/* Bridge URL */}
        {rosBridgeUrl && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">地址:</span> {rosBridgeUrl}
          </div>
        )}

        {/* Error Message */}
        {rosError && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
            <div className="font-medium text-red-800 mb-2">错误:</div>
            <div className="text-red-700 mb-3">{rosError}</div>
            
            {/* Installation Instructions */}
            {rosError.includes('timeout') || rosError.includes('Connection failed') ? (
              <div className="mt-2 text-sm text-red-600">
                <div className="font-medium mb-1">安装指引:</div>
                <div className="bg-gray-100 p-2 rounded font-mono text-xs mb-2">
                  sudo apt-get install ros-noetic-rosbridge-suite
                </div>
                <div className="font-medium mb-1">启动命令:</div>
                <div className="bg-gray-100 p-2 rounded font-mono text-xs">
                  roslaunch rosbridge_server rosbridge_websocket.launch
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Topic Status */}
        {topics.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2">
              主题状态 ({topicsWithData}/{topics.length} 有数据)
            </div>
            <div className="space-y-1">
              {topics.map((topic) => (
                <div key={topic.name} className="flex items-center gap-2 text-xs">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      topic.hasData ? 'bg-green-500' : topic.subscribed ? 'bg-yellow-500' : 'bg-gray-300'
                    }`}
                  ></div>
                  <span className="text-gray-700">{topic.name}</span>
                  {topic.error && (
                    <span className="text-red-600 text-xs">({topic.error})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

