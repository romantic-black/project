import { useState } from 'react';
import { sendCanFrame } from '../services/api';

export default function Control() {
  const [landTakeover, setLandTakeover] = useState(false);
  const [seaTakeover, setSeaTakeover] = useState(false);
  const [landSpeed, setLandSpeed] = useState(0);
  const [seaThrottle, setSeaThrottle] = useState(0);
  const [remoteMode, setRemoteMode] = useState<'auto' | 'remote'>('auto');
  const [sending, setSending] = useState(false);

  const sendLandTakeover = async (active: boolean) => {
    setSending(true);
    try {
      const data = active ? [0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00] : [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      await sendCanFrame(0x106, data);
      setLandTakeover(active);
    } catch (error) {
      console.error('Failed to send land takeover', error);
      alert('发送失败: ' + (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendSeaTakeover = async (active: boolean) => {
    setSending(true);
    try {
      const data = active ? [0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00] : [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      await sendCanFrame(0x116, data);
      setSeaTakeover(active);
    } catch (error) {
      console.error('Failed to send sea takeover', error);
      alert('发送失败: ' + (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendLandSpeed = async () => {
    setSending(true);
    try {
      const speedHex = Math.round(landSpeed / 0.05);
      const data = [speedHex & 0xFF, (speedHex >> 8) & 0xFF, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00];
      await sendCanFrame(0x106, data);
    } catch (error) {
      console.error('Failed to send land speed', error);
      alert('发送失败: ' + (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendSeaThrottle = async () => {
    setSending(true);
    try {
      const throttleHex = Math.round(seaThrottle / 0.05);
      const data = [0x00, 0x00, throttleHex & 0xFF, (throttleHex >> 8) & 0xFF, 0x10, 0x00, 0x00, 0x00];
      await sendCanFrame(0x116, data);
    } catch (error) {
      console.error('Failed to send sea throttle', error);
      alert('发送失败: ' + (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendRemoteMode = async (mode: 'auto' | 'remote') => {
    setSending(true);
    try {
      const data = mode === 'auto' ? [0x3B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] : [0x37, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      await sendCanFrame(0x102, data);
      setRemoteMode(mode);
    } catch (error) {
      console.error('Failed to send remote mode', error);
      alert('发送失败: ' + (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">控制面板</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">遥控器模式</h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => sendRemoteMode('auto')}
                disabled={sending || remoteMode === 'auto'}
                className={`px-4 py-2 rounded ${remoteMode === 'auto' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                无人模式
              </button>
              <button
                onClick={() => sendRemoteMode('remote')}
                disabled={sending || remoteMode === 'remote'}
                className={`px-4 py-2 rounded ${remoteMode === 'remote' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                遥控模式
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">陆上控制</h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => sendLandTakeover(true)}
                disabled={sending || landTakeover}
                className={`px-4 py-2 rounded ${landTakeover ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
              >
                接管请求
              </button>
              <button
                onClick={() => sendLandTakeover(false)}
                disabled={sending || !landTakeover}
                className={`px-4 py-2 rounded ${!landTakeover ? 'bg-red-500 text-white' : 'bg-gray-200'}`}
              >
                取消接管
              </button>
            </div>
            <div className="flex gap-4 items-center">
              <label className="text-sm">速度 (km/h):</label>
              <input
                type="number"
                value={landSpeed}
                onChange={(e) => setLandSpeed(Number(e.target.value))}
                className="border rounded px-2 py-1 w-20"
                min="0"
                max="60"
                step="0.1"
              />
              <button
                onClick={sendLandSpeed}
                disabled={sending}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                发送
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">水上控制</h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => sendSeaTakeover(true)}
                disabled={sending || seaTakeover}
                className={`px-4 py-2 rounded ${seaTakeover ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
              >
                接管请求
              </button>
              <button
                onClick={() => sendSeaTakeover(false)}
                disabled={sending || !seaTakeover}
                className={`px-4 py-2 rounded ${!seaTakeover ? 'bg-red-500 text-white' : 'bg-gray-200'}`}
              >
                取消接管
              </button>
            </div>
            <div className="flex gap-4 items-center">
              <label className="text-sm">油门 (%):</label>
              <input
                type="number"
                value={seaThrottle}
                onChange={(e) => setSeaThrottle(Number(e.target.value))}
                className="border rounded px-2 py-1 w-20"
                min="0"
                max="100"
                step="0.1"
              />
              <button
                onClick={sendSeaThrottle}
                disabled={sending}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

