// Skin processing preserves luminance detail; eye masks exclude pupils and bright reflections.
export const faceVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
`;
export const faceFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uVideo;
  uniform sampler2D uMask;
  uniform vec2 uSize;
  uniform vec4 uCrop;
  uniform float uMirror;
  uniform float uSmooth;
  uniform float uBrighten;
  uniform float uWhitening;
  uniform float uToneLift;
  uniform vec3 uToneTint;
  uniform float uToneSaturation;
  uniform float uIris;
  uniform float uRadius;
  uniform vec2 uEye0;
  uniform vec2 uAxisX0;
  uniform vec2 uAxisY0;
  uniform vec2 uEye1;
  uniform vec2 uAxisX1;
  uniform vec2 uAxisY1;
  float luma(vec3 color){return dot(color,vec3(.2126,.7152,.0722));}
  vec3 camera(vec2 displayUv){
    vec2 p=vec2(displayUv.x,1.0-displayUv.y);
    p.x=mix(p.x,1.0-p.x,uMirror);
    vec2 source=(p-uCrop.xy)/uCrop.zw;
    if(any(lessThan(source,vec2(0.0))) || any(greaterThan(source,vec2(1.0))))return vec3(.043137,.047059,.054902);
    return texture2D(uVideo,vec2(source.x,1.0-source.y)).rgb;
  }
  vec3 recolor(vec3 original,vec2 p,vec2 center,vec2 x,vec2 y,float lid){
    float det=x.x*y.y-x.y*y.x;
    if(abs(det)<.75 || lid<.001)return original;
    vec2 d=p-center;
    vec2 local=vec2(d.x*y.y-d.y*y.x,x.x*d.y-x.y*d.x)/det;
    float r=length(local);
    // Keep the pupil, eyelid, limbal edge, and original catchlights.
    float annulus=smoothstep(.27,.43,r)*(1.0-smoothstep(.88,1.0,r));
    float highlights=1.0-smoothstep(.55,.9,max(original.r,max(original.g,original.b)));
    float detail=clamp(luma(original)/.13,.4,2.0);
    vec3 navy=vec3(.028,.085,.205)*detail;
    navy*=1.0-smoothstep(.77,1.0,r)*.25;
    return mix(original,navy,annulus*highlights*lid*uIris*.92);
  }
  void main(){
    vec3 original=camera(vUv), masks=texture2D(uMask,vUv).rgb;
    vec3 result=original;
    if(masks.r>.001){
      vec3 sum=original;float total=1.0;
      // Joint spatial/range weighting reduces fine lines without a flat blur wash.
      for(int i=0;i<12;i++){
        float angle=float(i)*2.39996323;
        float ring=i<6?.55:1.0;
        vec2 offset=vec2(cos(angle),sin(angle))*uRadius*ring/uSize;
        vec3 neighbor=camera(vUv+offset);
        vec3 delta=neighbor-original;
        float sameSkin=texture2D(uMask,vUv+offset).r;
        float weight=exp(-dot(delta,delta)*95.0)*sameSkin*(i<6?.9:.55);
        sum+=neighbor*weight;total+=weight;
      }
      vec3 smoothColor=sum/total;
      result=mix(original,smoothColor,uSmooth*.78*masks.r);
      float y=luma(result);
      float lifted=y+y*(1.0-y)*uBrighten*.32*masks.r;
      result*=lifted/max(y,.001);
      // Lift midtones relative to each person's input, retaining shadows/highlights.
      // There is no solid skin-colour overlay or extra smoothing in the tone pass.
      if(uWhitening*uToneLift>.00001){
      float toneAmount=uWhitening*masks.r;
      float toneY=luma(result);
      float shadowProtection=smoothstep(.025,.14,toneY);
      float exposure=exp2(uToneLift*toneAmount*1.55*shadowProtection);
      float targetY=toneY*exposure/(1.0+toneY*(exposure-1.0));
      vec3 undertone=result*mix(vec3(1.0),uToneTint,toneAmount);
      undertone=mix(vec3(luma(undertone)),undertone,mix(1.0,uToneSaturation,toneAmount));
      vec3 toned=undertone*(targetY/max(luma(undertone),.001));
      // Compress chroma into the display gamut instead of clipping bright skin.
      float peak=max(toned.r,max(toned.g,toned.b));
      float compress=clamp((peak-.98)/max(peak-targetY,.001),0.0,1.0);
      result=mix(toned,vec3(targetY),compress);
      }
    }
    vec2 p=vec2(vUv.x,1.0-vUv.y)*uSize;
    result=recolor(result,p,uEye0,uAxisX0,uAxisY0,masks.g);
    result=recolor(result,p,uEye1,uAxisX1,uAxisY1,masks.b);
    gl_FragColor=vec4(clamp(result,0.0,1.0),1.0);
  }
`;
