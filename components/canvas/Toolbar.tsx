'use client'

import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { wallConfig } from '@/lib/cad/wallConfig'

interface Tool {
  id: string
  label: string
  icon: string
  shortcut?: string
}

const TOOLS: Tool[] = [
  { id: 'select',  label: 'Select',  icon: '↖',  shortcut: 'V' },
  { id: 'hand',    label: 'Pan',     icon: '✋',  shortcut: 'H' },
  { id: 'wall',    label: 'Wall',    icon: '▬',  shortcut: 'W' },
  { id: 'door',    label: 'Door',    icon: '🚪',  shortcut: 'D' },
  { id: 'window',  label: 'Window',  icon: '🪟',  shortcut: 'N' },
  { id: 'geo',     label: 'Shape',   icon: '□',  shortcut: 'R' },
  { id: 'text',    label: 'Text',    icon: 'T',   shortcut: 'T' },
  { id: 'eraser',  label: 'Erase',   icon: '⌫',  shortcut: 'E' },
]

const WALL_THICKNESSES = [10, 15, 20, 25, 30]

interface Props {
  activeTool: string
  onSelect: (tool: string) => void
}

export default function Toolbar({ activeTool, onSelect }: Props) {
  const [wallThickness, setWallThickness] = useState(wallConfig.thickness)

  const handleThickness = (t: number) => {
    wallConfig.thickness = t
    setWallThickness(t)
  }

  return (
    <TooltipProvider delay={300}>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 z-50">
        {TOOLS.map(tool => (
          <Tooltip key={tool.id}>
            <TooltipTrigger
              render={
                <button
                  onClick={() => onSelect(tool.id)}
                  className={`
                    w-9 h-9 flex items-center justify-center rounded-lg text-base transition-colors
                    ${activeTool === tool.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                    }
                  `}
                  aria-label={tool.label}
                >
                  {tool.icon}
                </button>
              }
            />
            <TooltipContent side="right" className="text-xs">
              {tool.label}{tool.shortcut && <span className="opacity-50 ml-1">{tool.shortcut}</span>}
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Thickness selector — only shown for wall tool */}
        {activeTool === 'wall' && (
          <>
            <div className="w-full h-px bg-gray-100 my-1" />
            <div className="flex flex-col gap-0.5 px-0.5">
              <span className="text-[10px] text-gray-400 text-center mb-0.5">cm</span>
              {WALL_THICKNESSES.map(t => (
                <button
                  key={t}
                  onClick={() => handleThickness(t)}
                  className={`
                    w-full text-xs rounded px-1 py-0.5 transition-colors
                    ${wallThickness === t
                      ? 'bg-gray-900 text-white font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                    }
                  `}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
