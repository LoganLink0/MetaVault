import { useEffect, useRef, useState } from "react";

// 数字滚动：ease-out 三次曲线，600ms 内定格终值；reduced-motion 直接显示终值
// 最终渲染恒等于 format(target)，动画只是过渡——断言友好的确定性终态
export default function CountUp({
  value,
  format,
  duration = 600,
  className,
  color,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
  color?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  useEffect(() => {
    fromRef.current = display;
  }, [display]);

  return <span className={className} style={color ? { color } : undefined}>{format(Math.round(display))}</span>;
}
