import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMExpressionPresetName } from '@pixiv/three-vrm';
import React, { useEffect, useRef, useState } from 'react';
import { VoiceService } from '../lib/voice-service';

interface GigiAvatarProps {
  expression?: string;
  isTalking?: boolean;
}

export const GigiAvatar: React.FC<GigiAvatarProps> = ({ expression, isTalking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const gltfRef = useRef<any>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const clockRef = useRef(new THREE.Clock());
  
  const currentExpressionRef = useRef(expression);
  const isTalkingRef = useRef(isTalking);
  const mouseRef = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    currentExpressionRef.current = expression;
  }, [expression]);

  useEffect(() => {
    isTalkingRef.current = isTalking;
  }, [isTalking]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(30, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 20);
    camera.position.set(0, 1.45, 1.25);
    camera.lookAt(0, 1.4, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      alpha: true, 
      antialias: true,
      preserveDrawingBuffer: true 
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(1, 4, 3);
    scene.add(sun);
    
    const fill = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(fill);

    const faceLight = new THREE.PointLight(0xffffff, 2.0, 5);
    faceLight.position.set(0, 1.5, 1);
    scene.add(faceLight);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const modelUrl = '/gigig.glb'; 
    const fallbackUrl = 'https://raw.githubusercontent.com/vrm-c/vrm1-samples/main/models/VRM1_Constraint_Sample.vrm';
    
    const loadModel = (url: string, isFallback = false) => {
      loader.load(
        url,
        (gltf) => {
          if (vrmRef.current) scene.remove(vrmRef.current.scene);
          if (gltfRef.current) scene.remove(gltfRef.current.scene);

          gltfRef.current = gltf;
          const vrm = gltf.userData.vrm as VRM | undefined;
          
          if (vrm) {
            vrmRef.current = vrm;
            scene.add(vrm.scene);
            vrm.scene.rotation.y = Math.PI;
            if (vrm.lookAt) {
              vrm.lookAt.autoUpdate = true;
            }
          } else {
            vrmRef.current = null;
            scene.add(gltf.scene);
            gltf.scene.rotation.y = Math.PI;
            
            if (gltf.animations && gltf.animations.length > 0) {
              const mixer = new THREE.AnimationMixer(gltf.scene);
              const idleClip = gltf.animations.find(a => a.name.toLowerCase().includes('idle')) || gltf.animations[0];
              const action = mixer.clipAction(idleClip);
              action.setEffectiveWeight(1.0);
              action.play();
              mixerRef.current = mixer;
            } else {
              // Procedural A-pose fallback for skeletons
              gltf.scene.traverse((obj: any) => {
                if (obj.isBone) {
                  const name = obj.name.toLowerCase();
                  if (name.includes('arm') && !name.includes('fore')) {
                    obj.rotation.z = name.includes('left') ? -Math.PI / 6 : Math.PI / 6;
                  }
                }
              });
            }

            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            // Heuristic to find head height
            let headPos = new THREE.Vector3();
            gltf.scene.traverse((obj: any) => {
              if (!headPos.y && (obj.name.toLowerCase().includes('head') || obj.name.toLowerCase().includes('neck'))) {
                obj.getWorldPosition(headPos);
              }
            });

            const targetY = headPos.y || (center.y + (size.y * 0.4));
            camera.position.set(0, targetY - 0.1, 1.4); // Pulled back for bust shot
            camera.lookAt(0, targetY - 0.2, 0); // Looking slightly below head for better framing
            
            // Move face light
            faceLight.position.set(0, targetY, 0.8);
          }
          
          gltf.scene.traverse((obj) => {
            if (obj.isObject3D) obj.frustumCulled = false;
          });
        },
        undefined,
        (error) => {
          console.error(`Error loading model from ${url}`, error);
          if (!isFallback) loadModel(fallbackUrl, true);
        }
      );
    };

    loadModel(modelUrl);

    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    
    const handleResize = () => {
      if (!canvasRef.current || !camera || !renderer) return;
      camera.aspect = canvasRef.current.clientWidth / canvasRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    };

    const resumeAudio = () => {
      VoiceService.resumeContext();
      window.removeEventListener('click', resumeAudio);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', resumeAudio);

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = Math.min(clockRef.current.getDelta(), 0.1);
      const elapsed = clockRef.current.getElapsedTime();

      // Always use the main scene for rendering
      const mainScene = sceneRef.current;
      if (!mainScene || !cameraRef.current || !rendererRef.current) return;

      if (vrmRef.current) {
        vrmRef.current.update(delta);

        const expManager = vrmRef.current.expressionManager;
        if (expManager) {
          const blinkValue = Math.sin(elapsed * 0.4) > 0.98 ? 1 : 0;
          expManager.setValue('blink', blinkValue);
          
          const vol = VoiceService.getVolume();
          if (isTalkingRef.current) {
             expManager.setValue('aa', THREE.MathUtils.lerp(expManager.getValue('aa') || 0, vol * 1.5, 0.4));
          } else {
             expManager.setValue('aa', THREE.MathUtils.lerp(expManager.getValue('aa') || 0, 0, 0.2));
          }

          if (currentExpressionRef.current) {
            applyExpressionInternal(vrmRef.current, currentExpressionRef.current);
          }
        }

        const humanoid = vrmRef.current.humanoid;
        const head = humanoid?.getNormalizedBoneNode('head') || humanoid?.getBoneNode('head');
        const neck = humanoid?.getNormalizedBoneNode('neck') || humanoid?.getBoneNode('neck');
        
        if (head || neck) {
           const tx = mouseRef.current.y * 0.25 + (Math.sin(elapsed * 0.5) * 0.05); // Added wander
           const ty = -mouseRef.current.x * 0.4 + (Math.cos(elapsed * 0.3) * 0.08); // Added wander
           if (neck) {
             neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, tx, 0.1);
             neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, ty, 0.1);
           }
           if (head) {
             head.rotation.z = Math.sin(elapsed * 1.5) * 0.05 + (Math.sin(elapsed * 0.2) * 0.02); // Added subtle tilt
           }
        }
        if (vrmRef.current.scene) {
           vrmRef.current.scene.position.y = Math.sin(elapsed * 2) * 0.005;
        }
      } 
      else if (gltfRef.current) {
        if (mixerRef.current) mixerRef.current.update(delta);

        const model = gltfRef.current.scene;
        let head: THREE.Object3D | undefined;
        let mouthMeshes: THREE.Mesh[] = [];
        
        model.traverse((obj: any) => {
           const name = (obj.name || '').toLowerCase();
           if (!head && (name.includes('head') || name.includes('neck'))) {
              head = obj;
           }
           if (obj.isMesh && obj.morphTargetInfluences) {
              const dict = obj.morphTargetDictionary || {};
              const keys = Object.keys(dict).map(k => k.toLowerCase());
              if (keys.some(k => k.includes('mouth') || k.includes('jaw') || k.includes('viseme') || k === 'a' || k === 'aa')) {
                 mouthMeshes.push(obj);
              }
           }
        });

        if (head) {
           const tx = mouseRef.current.y * 0.2 + (Math.sin(elapsed * 0.4) * 0.04);
           const ty = -mouseRef.current.x * 0.3 + (Math.cos(elapsed * 0.3) * 0.06);
           head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, tx, 0.05);
           head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, ty, 0.05);
           head.rotation.z = (Math.sin(elapsed * 0.2) * 0.03); // Natural head tilt
        }

        const vol = VoiceService.getVolume();
        if (isTalkingRef.current) {
           const lipVol = vol * 1.8; // Boosted for visibility
           mouthMeshes.forEach(mesh => {
              const dict = mesh.morphTargetDictionary!;
              for (const [key, value] of Object.entries(dict)) {
                 const k = key.toLowerCase();
                 // Very aggressive matching for any speech-related shape
                 if (k.includes('mouth') || k.includes('jaw') || k.includes('viseme') || k.includes('vowel') || k.match(/^[aeiou]$/) || k.includes('open')) {
                   mesh.morphTargetInfluences![value] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![value], lipVol, 0.4);
                 }
              }
           });
        } else {
           mouthMeshes.forEach(mesh => {
              mesh.morphTargetInfluences!.forEach((val, idx) => {
                 mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(val, 0, 0.2);
              });
           });
        }
        
        // Procedural "Alive" movements for standard GLB
        scene.traverse((obj: any) => {
           if (obj.isBone) {
              const name = obj.name.toLowerCase();
              // Breathing & Torso Sway
              if (name.includes('spine') || name.includes('chest') || name.includes('root') || name.includes('hips')) {
                 obj.rotation.x += Math.sin(elapsed * 1.5) * 0.0006;
                 obj.rotation.y += Math.cos(elapsed * 0.8) * 0.0004;
              }
              // Dynamic Arm Swaying (like Ani/Ara)
              if (name.includes('arm') && !name.includes('fore')) {
                 const side = name.includes('left') ? 1 : -1;
                 obj.rotation.z += Math.cos(elapsed * 1.1) * 0.002 * side; // Bigger sway
                 obj.rotation.x += Math.sin(elapsed * 0.7) * 0.001;
              }
              // Forearm subtle movements
              if (name.includes('forearm')) {
                 const side = name.includes('left') ? 1 : -1;
                 obj.rotation.y += Math.sin(elapsed * 1.3) * 0.001 * side;
              }
           }
        });

        model.position.y = Math.sin(elapsed * 1.8) * 0.008; // Slightly more bob
        model.rotation.y = Math.PI + Math.sin(elapsed * 0.5) * 0.02; // Subtle body turning
      }

      rendererRef.current.render(mainScene, cameraRef.current);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', resumeAudio);
      renderer.dispose();
    };
  }, []);

  const applyExpressionInternal = (vrm: VRM, name: string) => {
    const mgr = vrm.expressionManager;
    if (!mgr) return;

    const presets: VRMExpressionPresetName[] = ['happy', 'sad', 'angry', 'relaxed', 'surprised'];
    presets.forEach(p => {
      if (p === 'relaxed' && (name === 'Thinking' || name === 'Idle Smirk')) return;
      mgr.setValue(p, THREE.MathUtils.lerp(mgr.getValue(p) || 0, 0, 0.1));
    });

    switch (name) {
      case 'Shy Smile': case 'Happy': case 'Laughing':
        mgr.setValue('happy', THREE.MathUtils.lerp(mgr.getValue('happy') || 0, 1, 0.1));
        break;
      case 'Annoyed': case 'Tsundere Look': case 'Pout':
        mgr.setValue('angry', THREE.MathUtils.lerp(mgr.getValue('angry') || 0, 0.7, 0.1));
        break;
      case 'Shocked': case 'Surprised Blink':
        mgr.setValue('surprised', THREE.MathUtils.lerp(mgr.getValue('surprised') || 0, 1, 0.1));
        break;
      case 'Thinking': case 'Idle Smirk': case 'Smug':
        mgr.setValue('relaxed', THREE.MathUtils.lerp(mgr.getValue('relaxed') || 0, 0.6, 0.1));
        break;
      case 'Crying':
        mgr.setValue('sad', THREE.MathUtils.lerp(mgr.getValue('sad') || 0, 1, 0.1));
        break;
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden flex items-center justify-center pointer-events-none">
      <canvas ref={canvasRef} className="w-full h-full pointer-events-auto" />
      {!gltfRef.current && (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--primary)] font-bold text-xs uppercase tracking-widest animate-pulse">
          SYNCING NEURAL AVATAR...
        </div>
      )}
    </div>
  );
};
