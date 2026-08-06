import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus } from '@/lib/constants'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { userId, question, history = [] } = await request.json()

    if (!userId || !question) {
      return NextResponse.json({ error: 'userId and question are required' }, { status: 400 })
    }

    // Fetch employee data with individual error handling
    let tasks: any[] = []
    let leaves: any[] = []
    let user: any = null

    try {
      tasks = await db.task.findMany({
        where: { ownerId: userId, status: { notIn: [WorkflowStatus.CANCELLED] } },
        include: {
          taskSteps: { orderBy: { order: 'asc' } },
          owner: { select: { name: true, department: true, designation: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
    } catch (dbErr: any) {
      console.error('AI Assistant: Failed to fetch tasks:', dbErr.message)
    }

    try {
      leaves = await db.leave.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    } catch (dbErr: any) {
      console.error('AI Assistant: Failed to fetch leaves:', dbErr.message)
    }

    try {
      user = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, department: true, designation: true, role: true },
      })
    } catch (dbErr: any) {
      console.error('AI Assistant: Failed to fetch user:', dbErr.message)
    }

    // Build rich task context with step details
    const taskSummary = tasks.map(t => {
      const stepsDone = t.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
      const stepsTotal = t.taskSteps?.length || 0
      const stepDetails = (t.taskSteps || []).map((s: any, i: number) =>
        `    Step ${i + 1}: "${s.title}" — ${s.status}${s.assigneeId ? '' : ' (unassigned)'}${s.dueDate ? ` | Due: ${new Date(s.dueDate).toLocaleDateString()}` : ''}`
      ).join('\n')
      return `- "${t.title}" | Status: ${t.status} | Priority: ${t.priority} | Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No date'} | Category: ${t.category || 'N/A'} | Department: ${t.department || 'N/A'} | Steps: ${stepsDone}/${stepsTotal}\n${stepsTotal > 0 ? stepDetails : '    (No steps defined)'}`
    }).join('\n\n')

    const leaveSummary = leaves.map(l =>
      `- ${l.leaveType} | ${new Date(l.fromDate).toLocaleDateString()} to ${new Date(l.toDate).toLocaleDateString()} | ${l.totalDays} days | Status: ${l.status} | Tag: ${l.applicationTag}`
    ).join('\n')

    // Categorize tasks for the AI
    const pendingTasks = tasks.filter(t => t.status === 'PENDING')
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS')
    const highPriorityTasks = tasks.filter(t => ['HIGH', 'CRITICAL'].includes(t.priority))
    // Overdue = due date strictly before TODAY (start of day). Prevents today's tasks from being flagged as overdue.
    const _now1 = new Date()
    const _todayStart1 = new Date(_now1.getFullYear(), _now1.getMonth(), _now1.getDate())
    const overdueTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) < _todayStart1 && t.status !== 'COMPLETED')

    const systemPrompt = `You are an AI Workflow Assistant for Laxree Enterprise Operating System (EOS). You are designed to help employees organize, divide, and manage their work effectively.

EMPLOYEE INFO:
- Name: ${user?.name || 'Unknown'}
- Department: ${user?.department || 'N/A'}
- Designation: ${user?.designation || 'N/A'}
- Role: ${user?.role || 'EMPLOYEE'}

TASK SUMMARY:
Total Active Tasks: ${tasks.length}
- Pending: ${pendingTasks.length}
- In Progress: ${inProgressTasks.length}
- High/Critical Priority: ${highPriorityTasks.length}
- Overdue: ${overdueTasks.length}

DETAILED TASKS WITH STEPS:
${taskSummary || 'No tasks assigned'}

LEAVE HISTORY:
${leaveSummary || 'No leaves applied'}

IMPORTANT RULES:
1. Employees CANNOT mark tasks as Done — only Admin can do that
2. Employees can ONLY view their assigned tasks (read-only)
3. If an employee asks to complete/mark done a task, tell them only Admin can do that
4. Help them understand their task progress, what steps remain, and prioritize work
5. Guide them on leave policies: Apply 1 day before for "AL" (Approved Leave), same day = "LA" (Late Arrival, shown in red)
6. Be concise, friendly, and helpful
7. Use bullet points for lists

WORKFLOW DIVISION GUIDANCE — When an employee asks how to divide their work or organize their workflow, you MUST provide:
- Step-by-step breakdown of how to approach their tasks
- Priority ordering (what to do first, second, etc.)
- Time-blocking suggestions (morning/afternoon splits)
- Dependencies between tasks (if one must finish before another starts)
- Practical tips for managing workload
- Suggest breaking large tasks into smaller sub-steps if no steps exist

FORMAT YOUR RESPONSES:
- Use clear headings with emoji markers (📋, ⏰, 💡, ⚠️, ✅)
- Use numbered lists for sequential steps
- Use bullet points for options/suggestions
- Keep paragraphs short (2-3 sentences max)
- Always end with a helpful next-step suggestion

CURRENT DATE: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

    // Build conversation with history (max last 10 messages for context)
    const recentHistory = history.slice(-10)
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map((msg: { role: string; text: string }) => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.text,
      })),
      { role: 'user', content: question },
    ]

    // Use ZAI SDK for AI chat with retry logic
    let answer = ''
    let lastError: any = null

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const zai = await ZAI.create()
        const completion = await zai.chat.completions.create({
          messages,
          temperature: 0.7,
          max_tokens: 800,
        })
        answer = completion.choices?.[0]?.message?.content || ''
        if (answer) break
      } catch (sdkErr: any) {
        console.error(`AI Assistant SDK attempt ${attempt + 1} failed:`, sdkErr.message)
        lastError = sdkErr
      }
    }

    // If ZAI SDK failed, generate a helpful fallback response
    if (!answer) {
      console.error('AI Assistant: All SDK attempts failed, generating fallback response')
      answer = generateFallbackResponse(question, tasks, leaves, user, pendingTasks.length, inProgressTasks.length, highPriorityTasks.length, overdueTasks.length)
    }

    return NextResponse.json({ answer })
  } catch (error: any) {
    console.error('AI Assistant fatal error:', error)
    // Even on fatal error, return a helpful response instead of an error
    const fallbackAnswer = generateEmergencyFallback(error.message)
    return NextResponse.json({ answer: fallbackAnswer })
  }
}

// Generate a structured fallback response when AI SDK is unavailable
function generateFallbackResponse(
  question: string,
  tasks: any[],
  leaves: any[],
  user: any,
  pendingCount: number,
  inProgressCount: number,
  highPriorityCount: number,
  overdueCount: number
): string {
  const name = user?.name || 'Employee'
  const totalTasks = tasks.length

  const q = question.toLowerCase()

  // Task workflow division
  if (q.includes('divide') || q.includes('workflow') || q.includes('steps') || q.includes('organize')) {
    let response = `📋 **Workflow Division for ${name}**\n\n`
    response += `Here's how you can organize your ${totalTasks} task${totalTasks !== 1 ? 's' : ''}:\n\n`

    if (overdueCount > 0) {
      const _now2 = new Date()
      const _todayStart2 = new Date(_now2.getFullYear(), _now2.getMonth(), _now2.getDate())
      const overdueTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) < _todayStart2 && t.status !== 'COMPLETED')
      response += `⚠️ **URGENT — Overdue Tasks (${overdueCount}):**\n`
      overdueTasks.forEach(t => {
        response += `  ${t.priority === 'HIGH' || t.priority === 'CRITICAL' ? '🔴' : '🟡'} ${t.title} — Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'N/A'}\n`
      })
      response += '\n'
    }

    if (highPriorityCount > 0) {
      const hpTasks = tasks.filter(t => ['HIGH', 'CRITICAL'].includes(t.priority) && t.status !== 'COMPLETED')
      response += `🔴 **High Priority (${highPriorityCount}):**\n`
      hpTasks.forEach(t => {
        const stepsDone = t.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
        const stepsTotal = t.taskSteps?.length || 0
        response += `  ${t.title} — ${stepsDone}/${stepsTotal} steps done\n`
      })
      response += '\n'
    }

    const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS')
    if (inProgress.length > 0) {
      response += `🔵 **In Progress (${inProgress.length}):**\n`
      inProgress.forEach(t => {
        const stepsDone = t.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
        const stepsTotal = t.taskSteps?.length || 0
        response += `  ${t.title} — ${stepsDone}/${stepsTotal} steps\n`
      })
      response += '\n'
    }

    const pending = tasks.filter(t => t.status === 'PENDING')
    if (pending.length > 0) {
      response += `🟡 **Pending (${pending.length}):**\n`
      pending.forEach(t => {
        response += `  ${t.title}\n`
      })
      response += '\n'
    }

    response += `💡 **Suggested approach:**\n`
    response += `1. Complete overdue tasks first\n`
    response += `2. Focus on high-priority tasks during your peak hours\n`
    response += `3. Batch similar tasks together for efficiency\n`
    response += `4. Use quick action buttons below for more specific guidance!`

    return response
  }

  // Task prioritization
  if (q.includes('prioritize') || q.includes('first') || q.includes('important')) {
    let response = `⏰ **Task Prioritization for ${name}**\n\n`
    response += `You have ${totalTasks} task${totalTasks !== 1 ? 's' : ''} (${pendingCount} pending, ${inProgressCount} in progress)\n\n`

    if (overdueCount > 0) response += `🔴 **Do FIRST:** ${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''} — these are past deadline!\n`
    if (highPriorityCount > 0) response += `🟠 **Do NEXT:** ${highPriorityCount} high/critical priority task${highPriorityCount !== 1 ? 's' : ''}\n`
    if (inProgressCount > 0) response += `🔵 **Continue:** ${inProgressCount} task${inProgressCount !== 1 ? 's' : ''} already in progress\n`
    if (pendingCount > 0) response += `🟡 **Then:** ${pendingCount} pending task${pendingCount !== 1 ? 's' : ''}\n`

    response += `\n💡 Tip: Only Admin can mark tasks as Done, but you can track your progress here!`
    return response
  }

  // Task progress
  if (q.includes('progress') || q.includes('status') || q.includes('remaining')) {
    let response = `📊 **Task Progress Summary for ${name}**\n\n`
    tasks.forEach(t => {
      const stepsDone = t.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
      const stepsTotal = t.taskSteps?.length || 0
      const statusEmoji = t.status === 'COMPLETED' ? '✅' : t.status === 'IN_PROGRESS' ? '🔵' : t.status === 'PENDING' ? '🟡' : '⏸️'
      response += `${statusEmoji} **${t.title}** — ${t.status} (${stepsDone}/${stepsTotal} steps)\n`
    })
    response += `\n💡 Need more details? Click on any quick action below!`
    return response
  }

  // Week planning
  if (q.includes('week') || q.includes('plan') || q.includes('schedule')) {
    let response = `🗓️ **Week Plan for ${name}**\n\n`
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const activeTasks = tasks.filter(t => t.status !== 'COMPLETED')

    days.forEach((day, i) => {
      if (i < activeTasks.length) {
        const t = activeTasks[i]
        response += `**${day}:** ${t.title} (${t.priority} priority)\n`
      } else {
        response += `**${day}:** Buffer day / Follow up on previous tasks\n`
      }
    })

    if (overdueCount > 0) response += `\n⚠️ Note: You have ${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''} that should be addressed immediately!`
    response += `\n💡 Adjust this plan based on your actual workload and meetings.`
    return response
  }

  // Leave related
  if (q.includes('leave') || q.includes('time off') || q.includes('holiday')) {
    let response = `🏖️ **Leave Information for ${name}**\n\n`
    if (leaves.length > 0) {
      response += `Your recent leaves:\n`
      leaves.slice(0, 5).forEach(l => {
        const statusEmoji = l.status === 'APPROVED' ? '✅' : l.status === 'REJECTED' ? '❌' : '⏳'
        response += `${statusEmoji} ${l.leaveType}: ${new Date(l.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} to ${new Date(l.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} (${l.applicationTag})\n`
      })
    } else {
      response += `You haven't applied for any leaves yet.\n`
    }
    response += `\n📝 **Leave Policy:** Apply 1+ day before = AL (Approved Leave, shown in green). Same day = LA (Late Application, shown in red).\n`
    response += `Go to **Leave Management** to apply for leave.`
    return response
  }

  // Overdue/risk
  if (q.includes('overdue') || q.includes('risk') || q.includes('late')) {
    let response = `⚠️ **Risk Assessment for ${name}**\n\n`
    if (overdueCount > 0) {
      const _now3 = new Date()
      const _todayStart3 = new Date(_now3.getFullYear(), _now3.getMonth(), _now3.getDate())
      const overdueTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) < _todayStart3 && t.status !== 'COMPLETED')
      response += `**Overdue Tasks (${overdueCount}):**\n`
      overdueTasks.forEach(t => {
        const daysOverdue = Math.ceil((Date.now() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24))
        response += `  🔴 ${t.title} — ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue\n`
      })
    } else {
      response += `✅ No overdue tasks! You're on track.\n`
    }
    if (highPriorityCount > 0) response += `\n🟠 ${highPriorityCount} high-priority task${highPriorityCount !== 1 ? 's' : ''} need attention.\n`
    response += `\n💡 Focus on overdue items first, then high-priority tasks.`
    return response
  }

  // Default/generic response
  let response = `Hi ${name}! 👋\n\n`
  response += `Here's a quick overview of your work:\n\n`
  response += `📋 **Tasks:** ${totalTasks} total (${pendingCount} pending, ${inProgressCount} in progress)\n`
  if (overdueCount > 0) response += `⚠️ **Overdue:** ${overdueCount} task${overdueCount !== 1 ? 's' : ''}\n`
  if (highPriorityCount > 0) response += `🔴 **High Priority:** ${highPriorityCount} task${highPriorityCount !== 1 ? 's' : ''}\n`
  response += `🏖️ **Leaves:** ${leaves.length} applied\n\n`
  response += `💡 Try the quick action buttons below for specific help with your tasks!`
  return response
}

// Emergency fallback when even the fallback generator can't run properly
function generateEmergencyFallback(errorMessage: string): string {
  return `I'm having trouble connecting to my brain right now, but I'm still here to help! 🤖\n\nHere's what you can do:\n1. **Try again** — Click a quick action button or retype your question\n2. **Check your dashboard** — Go to "My Dashboard" for task overview\n3. **Apply for leave** — Use the Leave Management section\n\nIf this keeps happening, please let your admin know. (Error: ${errorMessage || 'Connection issue'})`
}
