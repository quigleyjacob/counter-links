export function getRegularCounterUrl({
    allySquadData,
    enemySquadData,
    isFleet,
    eventInstanceId
}) {
    const route = isFleet ? "ship-counters" : "counters"
    const url = `https://swgoh.gg/gac/${route}`



    let leader = enemySquadData?.squad?.[0]?.baseId
    if(!leader) {
        return url
    }

    let enemyUnits = getUnits('d', enemySquadData, isFleet)
    let allyUnits = getUnits('a', allySquadData, isFleet)
    let eventInstanceIdQuery = `season_id=${encodeURIComponent(eventInstanceId)}`

    return `${url}/${leader}?${[eventInstanceIdQuery, ...enemyUnits, ...allyUnits].join('&')}`
}

function getUnits(side, squadData, isFleet) {
    if(!squadData?.squad) return ''
    let leader = ""
    let member = []
    let reinforcement = []

    squadData.squad.forEach(({ baseId }, index) => {
        if (index === 0) {
            if(side === 'a') {
                leader = baseId
            }
        } else if (isFleet && index > 3) {
            reinforcement.push(baseId)
        } else {
            member.push(baseId)
        }
    })

    const useLeader = leader.length > 0
    const useMember = member.length > 0
    const useReinforce = reinforcement.length > 0

    const leaderQuery = useLeader && `${side}_lead=${leader}`

    const membersQuery = useMember && `${side}_member=${encodeURIComponent(member.join(','))}`

    const reinforcementsQuery = useReinforce && `${side}_reinforcement=${encodeURIComponent(reinforcement.join(','))}`

    return [leaderQuery, membersQuery, reinforcementsQuery].filter(Boolean)
}

export function getInsightCounterUrl({
    allySquadData,
    allyAccount,
    enemySquadData,
    enemyAccount,
    activeGac,
    isFleet,
    affixTextMap,
    units
}) {
    // console.log(allySquadData, allyAccount, enemySquadData, enemyAccount, activeGac, isFleet, affixTextMap, units)
    const allySquad = allySquadData?.squad || []
    const allyDatacron = allyAccount?.datacron?.find(d => d.id === allySquadData?.datacron)
    const allySquadBaseIdList = allySquad.map(u => u.baseId)

    const enemySquad = enemySquadData?.squad || []
    const enemyDatacron = enemyAccount?.datacon?.find(d => d.id === enemySquadData?.datacron)
    const enemySquadBaseIdList = enemySquad.map(u => u.baseId)

    const url = "https://swgoh.gg/gac/insight/battles"
    const base = { key: "g", value: 1 }
    const combatType = isFleet ? { key: "combat_type", value: 2 } : undefined
    const league = { key: "league", value: activeGac.league }
    const squadSize = isFleet ? undefined : { key: "squad_size", value: activeGac.mode }
    const showCleanups = { key: "show_cleanups", value: false }
    const isEnemyLeaderDead =
        enemySquad.length > 0 && !enemySquad[0].isAlive
            ? { key: "d_is_lead", value: true }
            : undefined

    const enemyLeader = getLeader(enemySquad, "d", activeGac)
    const enemyMembers = getSquadMembers(enemySquad, "d", isFleet)
    const enemyReinforcements = getReinforcements(enemySquad, "d", isFleet)
    const enemyDatacronQuery = getDatacron(
        enemyDatacron,
        "d",
        enemySquadBaseIdList,
        affixTextMap,
        units,
        isFleet
    )
    const enemyOmicrons = getOmicrons(enemySquad, 'd', enemyAccount, isFleet, squadSize)

    const allyLeader = getLeader(allySquad, 'a', activeGac)
    const allyMembers = getSquadMembers(allySquad, 'a', isFleet)
    const allyReinforcements = getReinforcements(allySquad, 'a', isFleet)
    const allyDatacronQuery = getDatacron(
        allyDatacron,
        'a',
        allySquadBaseIdList,
        affixTextMap,
        units,
        isFleet
    )
    const allyOmicrons = getOmicrons(allySquad, 'a', allyAccount, isFleet, squadSize)

    const excludeExpired = { key: "exclude_expired_datacrons", value: true }

    const query =
        "?" +
        [
            base,
            combatType,
            league,
            squadSize,
            showCleanups,
            isEnemyLeaderDead,
            enemyLeader,
            enemyMembers,
            enemyReinforcements,
            enemyDatacronQuery,
            enemyOmicrons,
            allyLeader,
            allyMembers,
            allyReinforcements,
            allyDatacronQuery,
            allyOmicrons,
            excludeExpired
        ]
            .filter(Boolean)
            .map(({ key, value }) => `${key}=${encodeURIComponent(value)}`)
            .join("&")

    return `${url}/${query}`
}

function getLeader(squad, side, activeGac) {
    if (side === "a") {
        const usedUnits = [
            squad.length > 0 ? squad[0].baseId : undefined,
              ...Object.values(activeGac?.homeStatus || {})
                .filter(v => v?.squad?.length > 0)
                .map(v => `-${v.squad[0].baseId}`)
        ]
            .filter(Boolean)
            .join(",")

        return { key: `${side}_lead`, value: usedUnits }
    }

    return squad.length > 0
        ? { key: `${side}_lead`, value: squad[0].baseId }
        : undefined
}

function getSquadMembers(squad, side, isFleet) {
    const slice = isFleet ? squad.slice(1, 4) : squad.slice(1)
    const value = slice
        .filter(u => u.isAlive ?? true)
        .map(u => u.baseId)
        .join(",")

    return value ? { key: `${side}_member`, value } : undefined
}

function getReinforcements(squad, side, isFleet) {
    if (!isFleet) return undefined

    const value = squad
        .slice(4)
        .filter(u => (u.isAlive ?? true) && u.baseId !== "HIDDEN")
        .map(u => u.baseId)
        .join(",")

    return value ? { key: `${side}_reinforcement`, value } : undefined
}

function getDatacron(datacron, side, squadBaseIdList, affixTextMap, units, isFleet) {
    if (isFleet || !datacron) return undefined

    const bonuses = [2, 5, 8, 11, 14]
        .map(i => {
            if (datacron.affix.length <= i) return undefined

            const affix = datacron.affix[i]
            const bonus = getBonus(affixTextMap, affix.targetRule, affix.abilityId)

            const categoryId = bonus.categoryId
            const matches = units.some(
                u => squadBaseIdList.includes(u.baseId) && u.categoryId.includes(categoryId)
            )

            return matches ? `${affix.targetRule}:${affix.abilityId}` : undefined
        })
        .filter(Boolean)
        .join(",")

    return bonuses
        ? { key: `${side}_datacron_pkeys`, value: bonuses }
        : undefined
}

function getBonus(affixTextMap, targetRule, abilityId) {
    let key = `${abilityId}:${targetRule}`
    return affixTextMap[key]
}

function getOmicrons(squad, side, account, isFleet, squadSize) {
    if (isFleet || squad?.length === 0) return undefined
    const GAC_MODE = 9
    const GAC_5V5_MODE = 15
    const GAC_3V3_MODE = 14
    const activeOmis = [GAC_MODE, squadSize === 5 ? GAC_5V5_MODE : GAC_3V3_MODE]

    const squadOmis = squad
        .filter(unit => unit.isAlive ?? true)
        .map(unit => {
            let baseId = unit.baseId
            let accountUnit = (account?.rosterUnit || []).find(u => u.baseId === baseId)
            if (!accountUnit) {
                return undefined
            }
            return activeOmis.map(mode => {
                let activeOmis = accountUnit?.omicron?.activatedByMode?.[mode] || []
                let activeOmisKeys = activeOmis.map(omi => `${baseId}:${omi}`)
                let missingOmis = accountUnit?.omicron?.missingByMode?.[mode] || []
                let missingOmisKeys = missingOmis.map(omi => `-${baseId}:${omi}`)

                return [...activeOmisKeys, ...missingOmisKeys]
            }).flat()
        })
        .filter(Boolean)
        .flat()
        .join(',')

    return squadOmis && { key: `${side}_omicron_skill_key`, value: squadOmis }

}