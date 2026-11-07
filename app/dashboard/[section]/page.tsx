import {notFound} from "next/navigation";
import AppDashboard from "../../../components/AppDashboard";
const valid=["projects","clients","downloads","history","brand-kit","settings"] as const;
export default async function DashboardSection({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!valid.includes(section as typeof valid[number]))notFound();return <AppDashboard section={section as typeof valid[number]}/>}
