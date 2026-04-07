import { Component } from 'react'
import { AppErrorPage } from './AppErrorPage'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <AppErrorPage
          title="Unable to render this page"
          message="A rendering issue interrupted this screen. Refresh the page. If this continues, return to the dashboard and try again."
        />
      )
    }
    return this.props.children
  }
}
