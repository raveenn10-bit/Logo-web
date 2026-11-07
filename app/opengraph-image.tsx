import { ImageResponse } from "next/og";

export const alt = "LOGOVA AI Logo Builder by Harsh Apex Digital Solutions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{width:"100%",height:"100%",display:"flex",background:"#0d1117",color:"#f5f6f8",padding:"72px 82px",position:"relative",fontFamily:"Arial, sans-serif"}}>
      <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",width:"72%"}}>
        <div style={{display:"flex",alignItems:"center",fontSize:42,fontWeight:800,letterSpacing:-2}}><span style={{display:"flex",width:25,height:25,background:"#ff7a00",marginRight:18,transform:"rotate(45deg)",borderRadius:5}}/>LOGO<span style={{color:"#ff7a00"}}>VA</span></div>
        <div style={{display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:19,color:"#ff9a42",letterSpacing:5,fontWeight:700}}>HARSH APEX DIGITAL SOLUTIONS</div>
          <div style={{display:"flex",flexDirection:"column",fontSize:68,lineHeight:1.04,fontWeight:800,letterSpacing:-4,marginTop:20}}><span>Professional logos.</span><span>Built around your brand.</span></div>
          <div style={{fontSize:24,color:"#b6beca",marginTop:24}}>First 2 logo concepts free · Editable SVG &amp; PNG</div>
        </div>
      </div>
      <div style={{position:"absolute",right:-110,top:-70,width:500,height:500,borderRadius:250,border:"2px solid #ff7a0060",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:320,height:320,borderRadius:160,background:"#ff7a00",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{display:"flex",width:125,height:125,background:"#0d1117",borderRadius:26,transform:"rotate(45deg)"}}/></div></div>
    </div>,
    size,
  );
}
