"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import Image from "next/image";

interface AnimatedLogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

const CONFIG = {
  sm: { container: 48, eyeRadius: 5, maxX: 15, maxY: 7 },
  md: { container: 72, eyeRadius: 7.5, maxX: 22, maxY: 10 },
  lg: { container: 96, eyeRadius: 10, maxX: 30, maxY: 14 },
};

const PHYSICS = {
  MIN_DISTANCE: 10,
  SCALE_FACTOR: 0.055,
  SPRING_CONFIG: { damping: 50, stiffness: 150, mass: 1 },
};

export function AnimatedLogo({ size = "md", showTagline = false }: AnimatedLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const config = CONFIG[size];
  const center = config.container / 2;

  const eyeX = useMotionValue(center - config.eyeRadius);
  const eyeY = useMotionValue(center - config.eyeRadius);

  const springX = useSpring(eyeX, PHYSICS.SPRING_CONFIG);
  const springY = useSpring(eyeY, PHYSICS.SPRING_CONFIG);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + center;
      const centerY = rect.top + center;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > PHYSICS.MIN_DISTANCE) {
        const dirX = deltaX / distance;
        const dirY = deltaY / distance;

        const scaledX = dirX * distance * PHYSICS.SCALE_FACTOR;
        const scaledY = dirY * distance * PHYSICS.SCALE_FACTOR;

        const constrainedX = Math.max(-config.maxX, Math.min(config.maxX, scaledX));
        const constrainedY = Math.max(-config.maxY, Math.min(config.maxY, scaledY));

        eyeX.set(center + constrainedX - config.eyeRadius);
        eyeY.set(center + constrainedY - config.eyeRadius);
      } else {
        eyeX.set(center - config.eyeRadius);
        eyeY.set(center - config.eyeRadius);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [center, config.maxX, config.maxY, config.eyeRadius, eyeX, eyeY]);

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative"
        style={{ width: config.container, height: config.container }}
      >
        <Image
          src="/iris-logo-no-eye.svg"
          alt="Iris Logo"
          fill
          className="absolute inset-0"
          draggable={false}
          priority
        />

        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: config.eyeRadius * 2,
            height: config.eyeRadius * 2,
            backgroundColor: "#FFC412",
            x: springX,
            y: springY,
            willChange: "transform",
          }}
        />
      </div>

      {showTagline && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground text-sm mt-2"
        >
          Powered by Nockchain
        </motion.p>
      )}
    </div>
  );
}
