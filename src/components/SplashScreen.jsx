import React, { useEffect, useState } from 'react'

/**
 * 开场动画：Logo 淡入放大 → 文字浮现 → 整体淡出进入首页
 * 总时长约 2.4s，结束后回调 onFinish
 */
function SplashScreen({ onFinish }) {
  const [phase, setPhase] = useState('enter')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 100)
    const t2 = setTimeout(() => setPhase('leave'), 1900)
    const t3 = setTimeout(() => onFinish?.(), 2400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onFinish])

  return (
    <div className={`splash splash-${phase}`} aria-hidden="true">
      <div className="splash-inner">
        <img
          className="splash-logo"
          src={`${import.meta.env.BASE_URL}assets/yinshuang-mark-deep.png`}
          alt=""
        />
        <p className="splash-eyebrow">WELCOME TO OUR WEDDING</p>
        <p className="splash-title">与山水相约 · 共赴浪漫之宴</p>
      </div>
    </div>
  )
}

export default SplashScreen
