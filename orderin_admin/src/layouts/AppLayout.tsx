import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="app-layout">
      <div className="sidebar-container">
        <Sidebar />
      </div>
      <div className="main-content">
        <div className="topbar">
          <Topbar />
        </div>
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
};
