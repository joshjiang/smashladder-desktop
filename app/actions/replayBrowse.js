import _ from 'lodash';
import watch from 'node-watch';
import fs from "fs";
import Build from "../utils/BuildData";
import Files from "../utils/Files";
import Constants from "../utils/Constants";
import Replay from "../utils/Replay";
import { beginWatchingForReplayChanges } from "./replayWatch";


export const REPLAY_BROWSE_START = 'REPLAY_BROWSE_START';
export const REPLAY_BROWSE_FAIL = 'REPLAY_BROWSE_FAIL';
export const REPLAY_BROWSE_END = 'REPLAY_BROWSE_END';

export const REPLAY_BROWSE_UPDATE_START = 'REPLAY_BROWSE_UPDATE_START';
export const REPLAY_BROWSE_UPDATE_SUCCESS = 'REPLAY_BROWSE_UPDATE_SUCCESS';

export const REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_BEGIN = 'REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_BEGIN';
export const REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_SUCCESS = 'REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_SUCCESS';
export const REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_FAIL = 'REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_FAIL';
export const REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_UPDATE = 'REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_UPDATE';

export const REPLAY_BROWSER_CHANGE_PAGE_NUMBER = 'REPLAY_BROWSER_CHANGE_PAGE_NUMBER';

export const DELETE_REPLAY_BEGIN = 'DELETE_REPLAY_BEGIN';
export const DELETE_REPLAY_SUCCESS = 'DELETE_REPLAY_SUCCESS';
export const DELETE_REPLAY_FAIL = 'DELETE_REPLAY_FAIL';

export const VIEW_REPLAY_DETAILS_BEGIN = 'VIEW_REPLAY_DETAILS_BEGIN';
export const VIEW_REPLAY_DETAILS_END = 'VIEW_REPLAY_DETAILS_END';


export const startReplayBrowser = () => (dispatch, getState) => {
	const state = getState();
	const { builds } = state.builds;
	const slippiBuilds = Build.getSlippiBuilds(builds);
	const { replayBrowseWatchProcess } = state.replayBrowse;

	if(!replayBrowseWatchProcess)
	{
		Replay.clearCache();
	}
	if(replayBrowseWatchProcess)
	{
		replayBrowseWatchProcess.close();
	}
	const slippiBuildPaths = slippiBuilds.map( (build) => build.getSlippiPath() );
	if(slippiBuildPaths.length === 0)
	{
		dispatch({
			type: REPLAY_BROWSE_FAIL
		});
		return;
	}

	const limitedUpdateBrowsedReplayList = _.debounce(() => {
		console.log('limited browse replay list update');
		dispatch(updateBrowsedReplayList());
	}, 20000,{
		leading: false,
		trailing: true,
	});
	const newWatcher = watch(slippiBuildPaths, { recursive: true }, (event, filePath) => {
		// Just brute force it for now, people with thousands of games will suffer...
		console.log('file updated');
		limitedUpdateBrowsedReplayList();
	});
	dispatch({
		type: REPLAY_BROWSE_START,
		payload: {
			replayBrowseWatchProcess: newWatcher,
			replayWatchBuilds: slippiBuilds,
		}
	});
	dispatch(updateBrowsedReplayList());
};

const updateBrowsedReplayList = () => (dispatch, getState) => {
	const state = getState();
	const { replayWatchBuilds } = state.replayBrowse;

	dispatch({
		type: REPLAY_BROWSE_UPDATE_START
	});
	const allReplays = new Set();
	_.each(replayWatchBuilds, (build) => {
		const slippiPath = build.getSlippiPath();
		const files = Files.findInDirectory(slippiPath, '.slp');
		files.forEach((file) => {
			if(file.endsWith(Constants.SLIPPI_REPLAY_FILE_NAME))
			{
				return;
			}
			const replay = Replay.retrieve({ id: file });
			replay.setBuild(build);
			allReplays.add(replay);
		});
	});
	dispatch({
		type: REPLAY_BROWSE_UPDATE_SUCCESS,
		payload: {
			allReplays: allReplays
		}
	});
	dispatch(displayReplaysBasedOnCurrentPage());
};

function yieldingLoop(count, chunksize, callback, cancelToken = {}) {
    let i = 0;
    let totalSkipped = 0;
    return new Promise((resolve, reject)=>{
		(function chunk() {
			const end = Math.min(i + chunksize, count);
			let skipTimeout = false;
			for ( ; i < end; ++i) {
				skipTimeout = callback.call(null, i);
			}
			if(cancelToken.cancelled)
			{
				reject();
				return;
			}
			if (i < count) {
				if(skipTimeout === true)
				{
					totalSkipped++;
					chunk.call(null);
				}
				else
				{
					setTimeout(chunk, 0);
				}
			} else {
				resolve(totalSkipped);
			}
		})();
	})
}

let lastCancelToken = {
	cancelled: false
};
const displayReplaysBasedOnCurrentPage = () => (dispatch, getState) => {
	const state = getState();
	const {allReplays, replayPageNumber, replaysPerPage, activeBrowseReplays, updatingReplayList, replayListHasChanged } = state.replayBrowse;

	const totalReplays = allReplays.size;
	const firstReplayIndex = (replayPageNumber - 1) * replaysPerPage;
	const lastReplayIndex = firstReplayIndex + replaysPerPage;

	const replayList = Array.from(allReplays);

    dispatch({
        type: REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_BEGIN,
    });
    lastCancelToken.cancelled = true;
    lastCancelToken = {
    	cancelled: false
	};
    yieldingLoop(replayList.length, 1, (index)=>{
		const replay = replayList[index];
		if(replay.hasFileDate())
		{
			return true;
		}
        dispatch({
            type: REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_UPDATE,
			payload: {
            	processed: index + 1
			}
        });
		replay.getFileDate();
	}, lastCancelToken).then(()=>{
		let replays = replayList;
		replays.sort((a, b) => {
			return a.getFileDate().isAfter(b.getFileDate()) ? -1 : 1;
		});
        if(firstReplayIndex > totalReplays)
        {
            console.log('first index is beyond total');
            replays = [];
        }
        else
        {
            replays = replays.slice(firstReplayIndex, lastReplayIndex);
        }

        dispatch({
            type: REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_SUCCESS,
            payload: {
                activeBrowseReplays: replays,
            }
        });
	})
	.catch((error)=>{
        dispatch({
            type: REPLAY_BROWSE_UPDATE_DISPLAYED_REPLAYS_FAIL,
        });
		console.error(error);
	});

};

export const viewReplayDetails = (replay) => (dispatch, getState) => {
	console.log(getState().replayBrowse);
	if(replay === getState().replayBrowse.viewingReplayDetails)
	{
		return dispatch({
			type: VIEW_REPLAY_DETAILS_END,
			payload: null,
		});
	}
	return dispatch({
		type: VIEW_REPLAY_DETAILS_BEGIN,
		payload: replay
	});
};

export const deleteReplay = (filePath) => (dispatch) => {
	dispatch({
		type: DELETE_REPLAY_BEGIN,
		payload: filePath
	});
	fs.unlink(filePath, (error) => {
		if(error){
			console.error(error);
			dispatch({
				type: DELETE_REPLAY_FAIL,
				payload: filePath
			});
			throw error;
		}
		dispatch({
			type: DELETE_REPLAY_SUCCESS,
			payload: filePath
		});
		dispatch(updateBrowsedReplayList());
	});
};

export const stopReplayBrowser = () => {
	return {
		type: REPLAY_BROWSE_END
	};
};

export const changeReplayPageNumber = (pageNumber) => (dispatch, getState) => {
	dispatch({
		type: REPLAY_BROWSER_CHANGE_PAGE_NUMBER,
		payload: pageNumber
	});
	dispatch(displayReplaysBasedOnCurrentPage());
};