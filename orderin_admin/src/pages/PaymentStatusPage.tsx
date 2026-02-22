import { useSearchParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AppLayout } from '../layouts/AppLayout';
import { CheckCircle, XCircle, Clock, Home, Download } from 'lucide-react';

export const PaymentStatusPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [transactionId] = useState(() => {
    return `TXN-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
  });

  const status = searchParams.get('status') || 'pending';
  const returnUrl = searchParams.get('returnUrl') || '/restaurants';

  const statusConfig = {
    success: {
      icon: CheckCircle,
      title: 'Payment Successful!',
      message: 'Your payment has been processed successfully. The restaurant will receive the payment shortly.',
      color: 'green',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    failed: {
      icon: XCircle,
      title: 'Payment Failed',
      message: 'Your payment could not be processed. Please try again or contact support.',
      color: 'red',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    pending: {
      icon: Clock,
      title: 'Payment Pending',
      message: 'Your payment is being processed. You will receive a confirmation soon.',
      color: 'yellow',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <AppLayout>
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header Card */}
          <div style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)',
            borderRadius: '16px',
            padding: '2rem',
            color: 'white',
            boxShadow: '0 20px 40px -10px rgba(6, 182, 212, 0.3)',
            animation: 'slideInUp 0.6s ease',
            textAlign: 'center',
          }}>
            <h1 style={{ fontSize: '1.875rem', fontWeight: '900', marginBottom: '0.5rem' }}>Payment Status</h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '1rem' }}>Transaction confirmation</p>
          </div>

          {/* Status Card */}
          <div style={{
            background: status === 'success' 
              ? 'rgba(16, 185, 129, 0.08)'
              : status === 'failed'
              ? 'rgba(239, 68, 68, 0.08)'
              : 'rgba(249, 115, 22, 0.08)',
            border: `2px solid ${status === 'success' 
              ? 'rgba(16, 185, 129, 0.4)'
              : status === 'failed'
              ? 'rgba(239, 68, 68, 0.4)'
              : 'rgba(249, 115, 22, 0.4)'}`,
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            boxShadow: status === 'success' 
              ? '0 15px 40px rgba(16, 185, 129, 0.15)'
              : status === 'failed'
              ? '0 15px 40px rgba(239, 68, 68, 0.15)'
              : '0 15px 40px rgba(249, 115, 22, 0.15)',
            animation: 'slideInUp 0.8s ease',
          }}>
            {/* Icon */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              animation: status === 'success' ? 'pulse 2s ease-in-out infinite' : 'spin 2s linear infinite',
              height: '80px',
              alignItems: 'center',
            }}>
              <Icon size={70} style={{
                color: status === 'success' 
                  ? '#10b981'
                  : status === 'failed'
                  ? '#ef4444'
                  : '#f97316',
                filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.2))',
              }} />
            </div>

            {/* Message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f1f5f9', lineHeight: '1.5' }}>{config.title}</h2>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.6' }}>{config.message}</p>
            </div>

            {/* Transaction Details */}
            <div style={{ 
              paddingTop: '1.5rem', 
              borderTop: '1px solid rgba(255, 255, 255, 0.1)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1rem',
              textAlign: 'left',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '12px',
              padding: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#cbd5e1', fontWeight: '500' }}>Transaction ID:</span>
                <span style={{ fontSize: '0.875rem', color: '#f1f5f9', fontFamily: 'monospace', fontWeight: '600' }}>{transactionId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#cbd5e1', fontWeight: '500' }}>Time:</span>
                <span style={{ fontSize: '0.875rem', color: '#f1f5f9', fontWeight: '500' }}>{new Date().toLocaleString()}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '1rem' }}>
              <button
                onClick={() => navigate(returnUrl)}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                  color: 'white',
                  fontWeight: '600',
                  padding: '0.875rem',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 15px rgba(6, 182, 212, 0.3)',
                  height: '44px',
                  fontSize: '1rem',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(6, 182, 212, 0.5)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 15px rgba(6, 182, 212, 0.3)';
                }}
              >
                <Home size={20} />
                Return to Dashboard
              </button>
              <button style={{
                width: '100%',
                border: '1.5px solid rgba(6, 182, 212, 0.4)',
                color: '#cbd5e1',
                fontWeight: '600',
                padding: '0.875rem',
                borderRadius: '10px',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(6, 182, 212, 0.1)';
                (e.currentTarget as HTMLElement).style.borderColor = '#06b6d4';
                (e.currentTarget as HTMLElement).style.color = '#06b6d4';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(6, 182, 212, 0.4)';
                (e.currentTarget as HTMLElement).style.color = '#cbd5e1';
              }}>
                <Download size={20} />
                Download Receipt
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};
