import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate password
    if (password !== '123456789') {
      setError('Invalid password. Please enter the correct password.');
      return;
    }
    
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      navigate('/dashboard', { replace: true });
    }, 600);
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'linear-gradient(135deg, #0f172a 0%, #2d1b69 30%, #0f172a 60%, #1a1f35 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated Background Circles - Enhanced */}
      <div style={{
        position: 'absolute',
        top: '5%',
        left: '5%',
        width: '350px',
        height: '350px',
        background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
        borderRadius: '50%',
        mixBlendMode: 'screen',
        filter: 'blur(100px)',
        opacity: '0.2',
        animation: 'float 25s ease-in-out infinite',
      }}></div>

      <div style={{
        position: 'absolute',
        top: '30%',
        right: '5%',
        width: '380px',
        height: '380px',
        background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
        borderRadius: '50%',
        mixBlendMode: 'screen',
        filter: 'blur(100px)',
        opacity: '0.18',
        animation: 'float 30s ease-in-out infinite 1s',
      }}></div>

      <div style={{
        position: 'absolute',
        bottom: '5%',
        left: '20%',
        width: '380px',
        height: '380px',
        background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
        borderRadius: '50%',
        mixBlendMode: 'screen',
        filter: 'blur(100px)',
        opacity: '0.18',
        animation: 'float 28s ease-in-out infinite 0.5s',
      }}></div>

      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '10%',
        width: '350px',
        height: '350px',
        background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
        borderRadius: '50%',
        mixBlendMode: 'screen',
        filter: 'blur(100px)',
        opacity: '0.2',
        animation: 'float 26s ease-in-out infinite 1.5s',
      }}></div>

      {/* Main Card Container */}
      <div style={{
        position: 'relative',
        zIndex: 20,
        width: '100%',
        maxWidth: '500px',
        animation: 'slideInUp 0.7s ease',
      }}>
        {/* Outer Glow Container */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(6, 182, 212, 0.15) 0%, transparent 70%)',
          borderRadius: '24px',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}></div>

        {/* Main Card */}
        <div style={{
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(45, 27, 105, 0.85) 50%, rgba(15, 23, 42, 0.92) 100%)',
          backdropFilter: 'blur(25px)',
          borderRadius: '24px',
          border: '1.5px solid rgba(6, 182, 212, 0.3)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          maxHeight: '95vh',
          overflowY: 'auto',
        }} className="hide-scrollbar">
          {/* Header Section */}
          <div style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            animation: 'slideInUp 0.8s ease',
          }}>
            {/* Icon Container */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '0.25rem',
            }}>
              <div style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {/* Icon Glow */}
                <div style={{
                  position: 'absolute',
                  inset: '-8px',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                  borderRadius: '16px',
                  filter: 'blur(20px)',
                  opacity: '0.7',
                  animation: 'pulse 2s ease-in-out infinite',
                }}></div>

                {/* Icon Badge */}
                <div style={{
                  position: 'relative',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)',
                  padding: '1rem',
                  borderRadius: '16px',
                  boxShadow: '0 15px 35px rgba(6, 182, 212, 0.3)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Sparkles size={28} color='white' strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {/* Title */}
            <div>
              <h1 style={{
                fontSize: '2.25rem',
                fontWeight: '950',
                background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.02em',
                lineHeight: '1.2',
                marginBottom: '0.25rem',
              }}>
                OrderIN
              </h1>
              <p style={{
                fontSize: '0.8rem',
                color: '#cbd5e1',
                fontWeight: '600',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.8,
              }}>
                🎯 Payment & Finance Hub
              </p>
            </div>

            {/* Subtitle */}
            <p style={{
              fontSize: '0.85rem',
              color: '#a1aec7',
              fontWeight: '500',
              lineHeight: '1.5',
            }}>
              Securely manage restaurant payments with real-time analytics
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: '0.75rem 1rem',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)',
              border: '1.5px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              animation: 'slideInUp 0.3s ease',
            }}>
              <div style={{
                width: '4px',
                height: '4px',
                background: '#ef4444',
                borderRadius: '50%',
              }}></div>
              <p style={{
                fontSize: '0.85rem',
                color: '#fca5a5',
                fontWeight: '500',
              }}>
                {error}
              </p>
            </div>
          )}

          {/* Form Section */}
          <form onSubmit={handleLogin} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            animation: 'slideInUp 0.9s ease',
          }}>
            {/* Email Field */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <label style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #cffafe 0%, #e9d5ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <Mail size={16} /> Email Address
              </label>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(30, 27, 75, 0.6)',
                border: '1.5px solid rgba(6, 182, 212, 0.35)',
                borderRadius: '12px',
                overflow: 'hidden',
                height: '48px',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(6, 182, 212, 0.6)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 15px rgba(6, 182, 212, 0.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(6, 182, 212, 0.35)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}>
                <Mail size={20} style={{
                  position: 'absolute',
                  left: '1rem',
                  color: '#06b6d4',
                  flexShrink: 0,
                }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your user mail id"
                  style={{
                    width: '100%',
                    paddingLeft: '3rem',
                    paddingRight: '1rem',
                    paddingTop: '0.75rem',
                    paddingBottom: '0.75rem',
                    fontSize: '1rem',
                    background: 'transparent',
                    color: '#f1f5f9',
                    border: 'none',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <label style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #e9d5ff 0%, #f472b6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <Lock size={16} /> Password
              </label>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(30, 27, 75, 0.6)',
                border: '1.5px solid rgba(168, 85, 247, 0.35)',
                borderRadius: '12px',
                overflow: 'hidden',
                height: '48px',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.6)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 15px rgba(168, 85, 247, 0.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.35)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}>
                <Lock size={20} style={{
                  position: 'absolute',
                  left: '1rem',
                  color: '#a855f7',
                  flexShrink: 0,
                }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter your password"
                  style={{
                    width: '100%',
                    paddingLeft: '3rem',
                    paddingRight: '3rem',
                    paddingTop: '0.75rem',
                    paddingBottom: '0.75rem',
                    fontSize: '1rem',
                    background: 'transparent',
                    color: '#f1f5f9',
                    border: 'none',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '1rem',
                    background: 'transparent',
                    border: 'none',
                    color: '#a855f7',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    padding: '0.5rem',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = '#ec4899';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = '#a855f7';
                  }}>
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                marginTop: '0.75rem',
                padding: '0.875rem 1.5rem',
                height: '48px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                color: 'white',
                fontWeight: '700',
                fontSize: '1.05rem',
                borderRadius: '12px',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                transition: 'all 0.3s ease',
                boxShadow: '0 8px 20px rgba(6, 182, 212, 0.3)',
                opacity: isLoading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 30px rgba(6, 182, 212, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(6, 182, 212, 0.3)';
                }
              }}>
              {isLoading ? (
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={20} style={{ transition: 'all 0.3s ease' }} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.3), transparent)',
          }}></div>

          {/* Demo Credentials Section */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            animation: 'slideInUp 1s ease',
          }}>
            <p style={{
              textAlign: 'center',
              fontSize: '0.8rem',
              color: '#cbd5e1',
              fontWeight: '600',
              letterSpacing: '0.05em',
            }}>
              ✨ Demo Credentials - Use Any Values
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
            }}>
              {/* Email Card */}
              <div style={{
                position: 'relative',
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)',
                border: '1.5px solid rgba(6, 182, 212, 0.4)',
                borderRadius: '12px',
                padding: '1rem',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(6, 182, 212, 0.7)';
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(6, 182, 212, 0.15)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(6, 182, 212, 0.4)';
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}>
                <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#06b6d4' }}>📧 Email</p>
                <p style={{ fontSize: '0.85rem', color: '#cffafe', fontFamily: 'monospace', fontWeight: '500' }}>admin@orderin.com</p>
              </div>

              {/* Password Card */}
              <div style={{
                position: 'relative',
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)',
                border: '1.5px solid rgba(168, 85, 247, 0.4)',
                borderRadius: '12px',
                padding: '1rem',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.7)';
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0.08) 100%)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(168, 85, 247, 0.15)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.4)';
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}>
                <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#a855f7' }}>🔐 Password</p>
                <p style={{ fontSize: '0.85rem', color: '#e9d5ff', fontWeight: '500', fontFamily: 'monospace' }}>123456789</p>
              </div>
            </div>
          </div>

          {/* Features Highlight */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            paddingTop: '0.75rem',
            animation: 'slideInUp 1.1s ease',
          }}>
            <div style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.35rem',
            }}>
              <div style={{
                fontSize: '1.5rem',
                transition: 'all 0.3s ease',
              }}>
                💰
              </div>
              <p style={{ fontSize: '0.7rem', color: '#cbd5e1', fontWeight: '500' }}>Payments</p>
            </div>

            <div style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.35rem',
            }}>
              <div style={{
                fontSize: '1.5rem',
                transition: 'all 0.3s ease',
              }}>
                📊
              </div>
              <p style={{ fontSize: '0.7rem', color: '#cbd5e1', fontWeight: '500' }}>Analytics</p>
            </div>

            <div style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.35rem',
            }}>
              <div style={{
                fontSize: '1.5rem',
                transition: 'all 0.3s ease',
              }}>
                🔒
              </div>
              <p style={{ fontSize: '0.7rem', color: '#cbd5e1', fontWeight: '500' }}>Secure</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
