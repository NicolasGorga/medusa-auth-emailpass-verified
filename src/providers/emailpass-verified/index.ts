import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import EmailPassVerified from "./services/emailpass-verified"

export default ModuleProvider(Modules.AUTH, {
    services: [EmailPassVerified]
})