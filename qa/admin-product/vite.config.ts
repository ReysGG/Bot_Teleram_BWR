import { defineConfig } from "vite";
import {fileURLToPath} from "node:url";
const path=(v:string)=>fileURLToPath(new URL(v,import.meta.url));
export default defineConfig({root:path("./"),server:{host:"127.0.0.1",port:4176,strictPort:true},resolve:{alias:{"next/navigation":path("./navigation.ts"),"@/components/admin/submit-admin-form":path("./submit.ts"),"@":path("../../src")}}});
