/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Type declarations for Vanta.js effect modules
 */

declare module 'vanta/dist/vanta.net.min' {
  import * as THREE from 'three';

  interface VantaEffect {
    destroy: () => void;
  }

  interface VantaOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    color?: string | number;
    backgroundColor?: string | number;
    points?: number;
    maxDistance?: number;
    spacing?: number;
    showDots?: boolean;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    scale?: number;
    scaleMobile?: number;
    [key: string]: any;
  }

  function VANTA(options: VantaOptions): VantaEffect;

  export default VANTA;
}

declare module 'vanta/dist/vanta.waves.min' {
  import * as THREE from 'three';

  interface VantaEffect {
    destroy: () => void;
  }

  interface VantaOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    color?: string | number;
    backgroundColor?: string | number;
    waveHeight?: number;
    waveSpeed?: number;
    shininess?: number;
    zoom?: number;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    scale?: number;
    scaleMobile?: number;
    [key: string]: any;
  }

  function VANTA(options: VantaOptions): VantaEffect;

  export default VANTA;
}

declare module 'vanta/dist/vanta.fog.min' {
  import * as THREE from 'three';

  interface VantaEffect {
    destroy: () => void;
  }

  interface VantaOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    highlightColor?: string | number;
    midtoneColor?: string | number;
    lowlightColor?: string | number;
    baseColor?: string | number;
    blurFactor?: number;
    speed?: number;
    zoom?: number;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    scale?: number;
    scaleMobile?: number;
    [key: string]: any;
  }

  function VANTA(options: VantaOptions): VantaEffect;

  export default VANTA;
}

declare module 'vanta/dist/vanta.birds.min' {
  import * as THREE from 'three';

  interface VantaEffect {
    destroy: () => void;
  }

  interface VantaOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    color?: string | number;
    backgroundColor?: string | number;
    quantity?: number;
    birdSize?: number;
    wingSpan?: number;
    speedLimit?: number;
    separation?: number;
    alignment?: number;
    cohesion?: number;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    scale?: number;
    scaleMobile?: number;
    [key: string]: any;
  }

  function VANTA(options: VantaOptions): VantaEffect;

  export default VANTA;
}

declare module 'vanta/dist/vanta.cells.min' {
  import * as THREE from 'three';

  interface VantaEffect {
    destroy: () => void;
  }

  interface VantaOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    color1?: string | number;
    color2?: string | number;
    size?: number;
    speed?: number;
    scale?: number;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    scaleMobile?: number;
    [key: string]: any;
  }

  function VANTA(options: VantaOptions): VantaEffect;

  export default VANTA;
}

declare module 'vanta/dist/vanta.clouds2.min' {
  import * as THREE from 'three';

  interface VantaEffect {
    destroy: () => void;
  }

  interface VantaOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    texturePath?: string;
    skyColor?: string | number;
    cloudColor?: string | number;
    cloudShadowColor?: string | number;
    sunColor?: string | number;
    sunGlareColor?: string | number;
    sunlightColor?: string | number;
    speed?: number;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    scale?: number;
    scaleMobile?: number;
    [key: string]: any;
  }

  function VANTA(options: VantaOptions): VantaEffect;

  export default VANTA;
}

declare module 'vanta/dist/vanta.rings.min' {
  import * as THREE from 'three';

  interface VantaEffect {
    destroy: () => void;
  }

  interface VantaOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    color?: string | number;
    backgroundColor?: string | number;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    scale?: number;
    scaleMobile?: number;
    [key: string]: any;
  }

  function VANTA(options: VantaOptions): VantaEffect;

  export default VANTA;
}
