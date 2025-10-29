import { Routes, Route, Link } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import Dashboard from './pages/Dashboard';
import Engine from './pages/Engine';
import VCU from './pages/VCU';
import ISG from './pages/ISG';
import Hydraulic from './pages/Hydraulic';
import Alarms from './pages/Alarms';
import Signals from './pages/Signals';
import Control from './pages/Control';

function App() {
  useWebSocket(['realtime/*']);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">CAN Telemetry</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  仪表盘
                </Link>
                <Link
                  to="/engine"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  发动机
                </Link>
                <Link
                  to="/vcu"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  VCU
                </Link>
                <Link
                  to="/isg"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  ISG
                </Link>
                <Link
                  to="/hydraulic"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  液压系统
                </Link>
                <Link
                  to="/alarms"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  告警
                </Link>
                <Link
                  to="/signals"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  信号浏览
                </Link>
                <Link
                  to="/control"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  控制面板
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/engine" element={<Engine />} />
          <Route path="/vcu" element={<VCU />} />
          <Route path="/isg" element={<ISG />} />
          <Route path="/hydraulic" element={<Hydraulic />} />
          <Route path="/alarms" element={<Alarms />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/control" element={<Control />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

