declare module "vanta/dist/vanta.net.min" {
  type NetOptions = {
    el: HTMLElement;
    THREE: typeof import("three");
    backgroundColor: number;
    color: number;
    points: number;
    maxDistance: number;
    spacing: number;
    showDots: boolean;
    mouseControls: boolean;
    touchControls: boolean;
    gyroControls: boolean;
    scale: number;
    scaleMobile: number;
  };

  type NetEffect = {
    destroy: () => void;
  };

  export default function createNet(options: NetOptions): NetEffect | undefined;
}
