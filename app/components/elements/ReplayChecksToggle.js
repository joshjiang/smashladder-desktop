import React, { Component } from 'react';

export default class ReplayChecksToggle extends Component {
	constructor(props) {
		super(props);

		this.onCheckForReplaysChange = this.checkForReplaysChange.bind(this);
		this.replayToggleElement = React.createRef();
	}

	componentDidMount() {
		console.log('mounted!');
		M.Tooltip.init(this.replayToggleElement.current);
	}

	checkForReplaysChange(event) {
		if (event.target.checked) {
			this.props.enableReplayWatching();
		} else {
			this.props.disableReplayWatching();
		}
	}

	render() {
		const { replayWatchEnabled } = this.props;
		return (
			<div ref={this.replayToggleElement}
			     data-position="top"
			     data-tooltip="If Replay Checks are too CPU heavy then disable this"
			     className="switch">
				<label>
					<span>No</span>
					<input
						onChange={this.onCheckForReplaysChange}
						checked={replayWatchEnabled}
						type="checkbox"
					/>
					<span className="lever"/>
					<span>Upload Slippi Results</span>
				</label>
			</div>
		);
	}
}