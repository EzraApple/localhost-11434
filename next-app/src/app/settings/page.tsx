"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "~/components/ui/button"
import dynamic from 'next/dynamic'

const ModelsTab = dynamic(() => import('./components/models/models-tab'), { ssr: false })
const SystemPromptsTab = dynamic(() => import('./components/system-prompts/system-prompts-tab'), { ssr: false })

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = React.useState<
    "system-prompts" | "models" | "knowledge-base"
  >("system-prompts")

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/")
    }
  }

  return (
    <div className="fixed inset-0 z-20">
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(closest-corner at 120px 36px, rgba(12, 78, 70, 0.20), rgba(12, 78, 70, 0.10)), linear-gradient(rgb(9, 18, 20) 15%, rgb(5, 10, 11))",
          }}
        />
        <div className="absolute inset-0 bg-noise" />
        <div className="absolute inset-0 bg-[#0b1515]/40" />
      </div>

      <div className="relative h-full w-full pt-10">
        <div className="absolute left-4 top-10">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="h-8 px-2 text-neutral-200 hover:text-white hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="flex w-full justify-center mt-14">
          <div
            className={
              "flex items-center gap-1 border md:border-[#11393644] border-[#11393633] shadow-sm " +
              "bg-[#113936]/15 supports-[backdrop-filter]:bg-[#113936]/15 backdrop-blur " +
              "rounded-xl px-1.5 py-1"
            }
          >
            <Button
              variant="ghost"
              className={
                "h-8 px-3 text-neutral-200 hover:text-[#d3e6e2] hover:bg-[#113936]/20 " +
                (activeTab === "system-prompts" ? "bg-[#113936]/40 text-white" : "")
              }
              onClick={() => setActiveTab("system-prompts")}
            >
              System Prompts
            </Button>
            <Button
              variant="ghost"
              className={
                "h-8 px-3 text-neutral-200 hover:text-[#d3e6e2] hover:bg-[#113936]/20 " +
                (activeTab === "models" ? "bg-[#113936]/40 text-white" : "")
              }
              onClick={() => setActiveTab("models")}
            >
              Models
            </Button>
            <Button
              variant="ghost"
              className={
                "h-8 px-3 text-neutral-200 hover:text-[#d3e6e2] hover:bg-[#113936]/20 " +
                (activeTab === "knowledge-base" ? "bg-[#113936]/40 text-white" : "")
              }
              onClick={() => setActiveTab("knowledge-base")}
            >
              Knowledge Base
            </Button>
          </div>
        </div>

        <div className="flex w-full justify-center mt-10">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
            {activeTab === "system-prompts" && "System Prompts"}
            {activeTab === "models" && "Models"}
            {activeTab === "knowledge-base" && "Knowledge Base"}
          </h1>
        </div>

        {activeTab === 'models' ? (
          <div className="mt-6 flex w-full justify-center">
            <div className="w-full max-w-4xl px-4">
              <ModelsTab />
            </div>
          </div>
        ) : null}
        {activeTab === 'system-prompts' ? (
          <div className="mt-6 flex w-full justify-center">
            <div className="w-full max-w-4xl px-4">
              <SystemPromptsTab />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}


