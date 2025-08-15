import * as core from '@actions/core'
import * as github from '@actions/github'
import { Context } from '@actions/github/lib/context'
import { PullRequest } from '../src/pull_request'

jest.mock('@actions/core')
jest.mock('@actions/github')

describe('PullRequest', () => {
  let context: Context
  let pullRequest: PullRequest
  let mockClient: any

  beforeEach(() => {
    context = {
      eventName: '',
      workflow: '',
      action: '',
      actor: '',
      payload: {
        action: 'opened',
        number: '1',
        pull_request: {
          number: 1,
          labels: [],
          title: 'test',
          user: {
            login: 'pr-creator',
          },
        },
        repository: {
          name: 'auto-assign',
          owner: {
            login: 'kentaro-m',
          },
        },
      },
      repo: {
        owner: 'kentaro-m',
        repo: 'auto-assign',
      },
      issue: {
        owner: 'kentaro-m',
        repo: 'auto-assign',
        number: 1,
      },
      sha: '',
      ref: '',
    } as unknown as Context

    // Create a mock client that we'll reuse
    mockClient = {
      rest: {
        pulls: {
          requestReviewers: jest.fn(),
          listRequestedReviewers: jest.fn(),
          listReviews: jest.fn(),
        },
        issues: {
          addAssignees: jest.fn(),
        },
      },
    }

    // Mock the client to return our mock client
    ;(github.getOctokit as jest.Mock).mockImplementation(() => mockClient)

    pullRequest = new PullRequest(mockClient, context)
  })

  describe('getCurrentReviewers', () => {
    test.each([
      {
        description: 'returns current reviewers when API call succeeds',
        mockResponse: {
          status: 200,
          data: { users: [{ login: 'reviewer1' }, { login: 'reviewer2' }] },
        },
        expected: ['reviewer1', 'reviewer2'],
      },
      {
        description: 'returns empty array when no users found',
        mockResponse: { status: 200, data: { users: [] } },
        expected: [],
      },
      {
        description: 'returns empty array when users is undefined',
        mockResponse: { status: 200, data: {} },
        expected: [],
      },
      {
        description: 'returns empty array when API call fails',
        mockResponse: { status: 404, data: null },
        expected: [],
      },
    ])('$description', async ({ mockResponse, expected }) => {
      mockClient.rest.pulls.listRequestedReviewers.mockResolvedValue(
        mockResponse as any
      )

      const result = await pullRequest.getCurrentReviewers()

      expect(result).toEqual(expected)
      if (expected.length > 0) {
        expect(
          mockClient.rest.pulls.listRequestedReviewers
        ).toHaveBeenCalledWith({
          owner: 'kentaro-m',
          repo: 'auto-assign',
          pull_number: 1,
        })
      }
    })

    test('returns empty array and logs error when API throws', async () => {
      const debugSpy = jest.spyOn(core, 'debug')
      mockClient.rest.pulls.listRequestedReviewers.mockRejectedValue(
        new Error('API Error')
      )

      const result = await pullRequest.getCurrentReviewers()

      expect(result).toEqual([])
      expect(debugSpy).toHaveBeenCalledWith('Error: API Error')
    })
  })

  describe('addReviewers', () => {
    const debugSpy = jest.spyOn(core, 'debug')

    beforeEach(() => {
      debugSpy.mockClear()
      mockClient.rest.pulls.requestReviewers.mockResolvedValue({} as any)
    })

    test.each([
      {
        description: 'adds all reviewers when none currently assigned',
        currentUsers: [],
        requestedReviewers: ['reviewer1', 'reviewer2'],
        expectedCall: ['reviewer1', 'reviewer2'],
        shouldCallAPI: true,
      },
      {
        description: 'only adds new reviewers when some already assigned',
        currentUsers: [{ login: 'reviewer1' }],
        requestedReviewers: ['reviewer1', 'reviewer2', 'reviewer3'],
        expectedCall: ['reviewer2', 'reviewer3'],
        shouldCallAPI: true,
      },
      {
        description: 'does not call API when all reviewers already assigned',
        currentUsers: [{ login: 'reviewer1' }, { login: 'reviewer2' }],
        requestedReviewers: ['reviewer1', 'reviewer2'],
        expectedCall: null,
        shouldCallAPI: false,
        expectDebugMessage: 'No new reviewers to add',
      },
      {
        description: 'does not call API when empty reviewers array provided',
        currentUsers: [],
        requestedReviewers: [],
        expectedCall: null,
        shouldCallAPI: false,
        expectDebugMessage: 'No new reviewers to add',
      },
    ])(
      '$description',
      async ({
        currentUsers,
        requestedReviewers,
        expectedCall,
        shouldCallAPI,
        expectDebugMessage,
      }) => {
        mockClient.rest.pulls.listRequestedReviewers.mockResolvedValue({
          status: 200,
          data: { users: currentUsers },
        } as any)

        await pullRequest.addReviewers(requestedReviewers)

        if (shouldCallAPI) {
          expect(mockClient.rest.pulls.requestReviewers).toHaveBeenCalledWith({
            owner: 'kentaro-m',
            repo: 'auto-assign',
            pull_number: 1,
            reviewers: expectedCall,
          })
        } else {
          expect(mockClient.rest.pulls.requestReviewers).not.toHaveBeenCalled()
          if (expectDebugMessage) {
            expect(debugSpy).toHaveBeenCalledWith(expectDebugMessage)
          }
        }
      }
    )

    test('handles getCurrentReviewers error gracefully and still adds reviewers', async () => {
      mockClient.rest.pulls.listRequestedReviewers.mockRejectedValue(
        new Error('API Error')
      )

      await pullRequest.addReviewers(['reviewer1', 'reviewer2'])

      expect(mockClient.rest.pulls.requestReviewers).toHaveBeenCalledWith({
        owner: 'kentaro-m',
        repo: 'auto-assign',
        pull_number: 1,
        reviewers: ['reviewer1', 'reviewer2'],
      })
    })

    test('logs API response when successfully adding reviewers', async () => {
      mockClient.rest.pulls.listRequestedReviewers.mockResolvedValue({
        status: 200,
        data: { users: [] },
      } as any)
      const mockResult = { data: { message: 'Success' } }
      mockClient.rest.pulls.requestReviewers.mockResolvedValue(
        mockResult as any
      )

      await pullRequest.addReviewers(['reviewer1'])

      expect(debugSpy).toHaveBeenCalledWith(JSON.stringify(mockResult))
    })
  })
})
