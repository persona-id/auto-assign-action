import * as core from '@actions/core'
import { Context } from '@actions/github/lib/context'
import { Client } from './types'

export class PullRequest {
  private client: Client
  private context: Context

  constructor(client: Client, context: Context) {
    this.client = client
    this.context = context
  }

  async getApprovers(): Promise<string[]> {
    const { owner, repo, number: pull_number } = this.context.issue
    try {
      const result = await this.client.rest.pulls.listReviews({
        owner,
        repo,
        pull_number,
      })
      core.debug(JSON.stringify(result))
      if (result.status == 200 && result.data) {
        return result.data
          .filter((review) => review.state === 'APPROVED')
          .map((review) => review?.user?.login)
          .filter((login): login is string => !!login) // filter undefined
      } else {
        return []
      }
    } catch (err) {
      core.debug(String(err))
      return []
    }
  }

  async getCurrentReviewers(): Promise<string[]> {
    const { owner, repo, number: pull_number } = this.context.issue
    try {
      const result = await this.client.rest.pulls.listRequestedReviewers({
        owner,
        repo,
        pull_number,
      })
      core.debug(JSON.stringify(result))
      if (result.status === 200 && result.data) {
        return result.data.users?.map((user) => user.login) || []
      } else {
        return []
      }
    } catch (err) {
      core.debug(String(err))
      return []
    }
  }

  async addReviewers(reviewers: string[]): Promise<void> {
    const { owner, repo, number: pull_number } = this.context.issue

    // Get current reviewers to avoid duplicates
    const currentReviewers = await this.getCurrentReviewers()
    const newReviewers = reviewers.filter(
      (reviewer) => !currentReviewers.includes(reviewer)
    )

    // Only make API call if there are new reviewers to add
    if (newReviewers.length === 0) {
      core.debug('No new reviewers to add')
      return
    }

    const result = await this.client.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number,
      reviewers: newReviewers,
    })
    core.debug(JSON.stringify(result))
  }

  async addAssignees(assignees: string[]): Promise<void> {
    const { owner, repo, number: issue_number } = this.context.issue
    const result = await this.client.rest.issues.addAssignees({
      owner,
      repo,
      issue_number,
      assignees,
    })
    core.debug(JSON.stringify(result))
  }

  hasAnyLabel(labels: string[]): boolean {
    if (!this.context.payload.pull_request) {
      return false
    }
    const { labels: pullRequestLabels = [] } = this.context.payload.pull_request
    return pullRequestLabels.some((label) => labels.includes(label.name))
  }
}
