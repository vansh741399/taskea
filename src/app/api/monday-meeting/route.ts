import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/monday-meeting?userId=xxx&weekNumber=xxx&year=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const weekNumber = searchParams.get('weekNumber')
    const year = searchParams.get('year')

    if (userId && weekNumber && year) {
      // Get specific scorecard
      const scorecard = await db.mondayMeeting.findUnique({
        where: { userId_weekNumber_year: { userId, weekNumber: Number(weekNumber), year: Number(year) } },
        include: { user: { select: { id: true, name: true, department: true, designation: true, phone: true } } },
      })
      return NextResponse.json(scorecard)
    }

    if (userId) {
      // Get all scorecards for a user
      const scorecards = await db.mondayMeeting.findMany({
        where: { userId },
        include: { user: { select: { id: true, name: true, department: true, designation: true, phone: true } } },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      })
      return NextResponse.json(scorecards)
    }

    // Get all scorecards
    const scorecards = await db.mondayMeeting.findMany({
      include: { user: { select: { id: true, name: true, department: true, designation: true, phone: true } } },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    })
    return NextResponse.json(scorecards)
  } catch (error: any) {
    console.error('MondayMeeting GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/monday-meeting
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      userId, weekStartDate, weekEndDate, weekNumber, year,
      planRedScore, planYellowScore, planGreenScore,
      actualRedScore, actualYellowScore, actualGreenScore,
      nextRedScore, nextYellowScore, nextGreenScore,
      prScore, commitments, notes,
    } = body

    // Upsert: create or update if same user+week+year
    const scorecard = await db.mondayMeeting.upsert({
      where: { userId_weekNumber_year: { userId, weekNumber, year } },
      update: {
        weekStartDate: new Date(weekStartDate),
        weekEndDate: new Date(weekEndDate),
        planRedScore, planYellowScore, planGreenScore,
        actualRedScore, actualYellowScore, actualGreenScore,
        nextRedScore, nextYellowScore, nextGreenScore,
        prScore, commitments, notes,
      },
      create: {
        userId,
        weekStartDate: new Date(weekStartDate),
        weekEndDate: new Date(weekEndDate),
        weekNumber, year,
        planRedScore, planYellowScore, planGreenScore,
        actualRedScore, actualYellowScore, actualGreenScore,
        nextRedScore, nextYellowScore, nextGreenScore,
        prScore, commitments, notes,
      },
      include: { user: { select: { id: true, name: true, department: true, designation: true, phone: true } } },
    })

    return NextResponse.json(scorecard)
  } catch (error: any) {
    console.error('MondayMeeting POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/monday-meeting?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await db.mondayMeeting.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('MondayMeeting DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
