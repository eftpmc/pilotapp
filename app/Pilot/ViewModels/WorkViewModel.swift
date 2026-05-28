import Foundation

@MainActor
final class WorkViewModel: ObservableObject {
    @Published var runs: [AgentSession] = []
    @Published var agents: [Agent] = []
    @Published var projects: [Project] = []
    @Published var tasks: [WorkTask] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let r = APIClient.shared.fetchSessions()
            async let a = APIClient.shared.fetchAgents()
            async let p = APIClient.shared.fetchProjects()
            async let t = APIClient.shared.fetchTasks()
            (runs, agents, projects, tasks) = try await (r, a, p, t)
            runs.sort { $0.createdAt > $1.createdAt }
            tasks.sort { $0.createdAt > $1.createdAt }
        } catch {
            if (error as? URLError)?.code == .cancelled { return }
            self.error = error.localizedDescription
        }
    }

    // MARK: - Direct dispatch (no task record)

    func dispatch(agentId: String, projectId: String, baseBranch: String?) async -> AgentSession? {
        do {
            let run = try await APIClient.shared.createSession(
                agentId: agentId,
                projectId: projectId,
                baseBranch: baseBranch
            )
            runs.insert(run, at: 0)
            return run
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    // MARK: - Task queue

    func createTask(projectId: String, title: String, prompt: String, baseBranch: String) async -> WorkTask? {
        do {
            let task = try await APIClient.shared.createTask(
                projectId: projectId,
                title: title,
                prompt: prompt,
                baseBranch: baseBranch
            )
            tasks.insert(task, at: 0)
            return task
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func deleteTask(_ task: WorkTask) async {
        do {
            try await APIClient.shared.deleteTask(id: task.id)
            tasks.removeAll { $0.id == task.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Assign a specific agent to a pending task. Passes the API key so the server auto-starts the agent.
    func assignTask(_ task: WorkTask, to agent: Agent) async -> AgentSession? {
        guard let apiKey = KeychainService.load(for: "apiKey_agent_\(agent.id)") else {
            self.error = "No API key configured for \(agent.name)"
            return nil
        }
        do {
            let response = try await APIClient.shared.assignTask(taskId: task.id, agentId: agent.id, apiKey: apiKey)
            if let idx = tasks.firstIndex(where: { $0.id == task.id }) {
                tasks[idx] = response.task
            }
            runs.insert(response.session, at: 0)
            return response.session
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    /// Auto-dispatch: assign idle agents to pending tasks by role. Passes API keys for auto-start.
    func runQueue() async -> [(task: WorkTask, session: AgentSession)] {
        // Collect API keys for all ready agents so the server can auto-start them
        var agentApiKeys: [String: String] = [:]
        for agent in readyAgents {
            if let key = KeychainService.load(for: "apiKey_agent_\(agent.id)") {
                agentApiKeys[agent.id] = key
            }
        }
        do {
            let response = try await APIClient.shared.runQueue(agentApiKeys: agentApiKeys)
            for pair in response.dispatched {
                if let idx = tasks.firstIndex(where: { $0.id == pair.task.id }) {
                    tasks[idx] = pair.task
                }
                runs.insert(pair.session, at: 0)
            }
            return response.dispatched.map { ($0.task, $0.session) }
        } catch {
            self.error = error.localizedDescription
            return []
        }
    }

    // MARK: - Runs

    func deleteRun(_ run: AgentSession) async {
        do {
            try await APIClient.shared.deleteSession(sessionId: run.id)
            runs.removeAll { $0.id == run.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Agents

    func createAgent(name: String, provider: AgentProvider, apiKey: String) async -> Agent? {
        do {
            let agent = try await APIClient.shared.createAgent(name: name, provider: provider)
            KeychainService.save(apiKey, for: "apiKey_agent_\(agent.id)")
            agents.append(agent)
            return agent
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func deleteAgent(_ agent: Agent) async {
        do {
            try await APIClient.shared.deleteAgent(id: agent.id)
            KeychainService.delete(for: "apiKey_agent_\(agent.id)")
            agents.removeAll { $0.id == agent.id }
            runs.removeAll { $0.agentId == agent.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Lookups

    func agent(for run: AgentSession) -> Agent? {
        agents.first { $0.id == run.agentId }
    }

    func project(for run: AgentSession) -> Project? {
        projects.first { $0.id == run.projectId }
    }

    func tasks(for project: Project) -> [WorkTask] {
        tasks.filter { $0.projectId == project.id }
    }

    func task(for run: AgentSession) -> WorkTask? {
        guard let workTaskId = run.workTaskId else { return nil }
        return tasks.first { $0.id == workTaskId }
    }

    func hasApiKey(for agent: Agent) -> Bool {
        KeychainService.load(for: "apiKey_agent_\(agent.id)") != nil
    }

    var readyAgents: [Agent] {
        agents.filter { hasApiKey(for: $0) }
    }

    /// Agents that can work on tasks for a given project role.
    func eligibleAgents(for project: Project) -> [Agent] {
        readyAgents.filter { agent in
            project.role == .any || project.role.rawValue == agent.provider.rawValue
        }
    }

    var pendingTaskCount: Int {
        tasks.filter { $0.status == .pending }.count
    }

    var idleAgentCount: Int {
        let busyIds = Set(runs.filter { $0.status == .running }.map(\.agentId))
        return readyAgents.filter { !busyIds.contains($0.id) }.count
    }
}
