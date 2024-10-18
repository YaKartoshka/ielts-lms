const globalBrackets = [];
const globalBracketsParticipants=[];
var globalBracketIndex;
$(() => {
    getBrackets()

});

function getBrackets() {
    $('#brackets').html('')
    $.ajax({
        url: `/competitions/${globalCompetitionId}/bracket`,
        method: 'POST',
        data: { action: 'getBrackets' },
        dataType: 'json',
        success: function (data) {
            if (data) {
                data.forEach((b, index) => {
                    let bracketHTML = `
                    <div class="bracket mb-3 p-3 rounded container bg-white">
                      <h3 class="mb-2">${b.name}</h3>
                      <button class="btn btn-primary" onclick="showBracket('bracket-${index}')">Show Bracket</button>
                      ${globalRole == 'admin' ? `<button class="btn btn-danger" id="delete_bracket_btn_${index}" onclick="showDeleteBracketModal('bracket-${index}')">Delete Bracket</button>` : ''}
                      <div id="bracket-${index}" class="brackets-viewer" style="display: none"></div>
                    </div>
                  `;

                    $('#brackets').append(bracketHTML);
                    $(`#bracket-${index}`).click(function () {
                        globalBracketIndex = $(this).attr('id');
                    });
                    var bracket_data = JSON.parse(b.bracket_data)
                    globalBrackets.push({ ...bracket_data, bracket_id: b.bracket_id })
                    renderBracket(bracket_data, index);
                    globalBrackets.forEach((bracket)=>{
                        bracket.participant.forEach((participant)=>{
                            globalBracketsParticipants.push(participant.name)
                        });
                    });
                });
              
                if (!data.length) {
                    let bracketHTML = `
                    <div class="bracket  p-3 rounded container bg-white">
                        <h3>No brackets yet </h3>
                    </div>
                    `
                    return $('#brackets').append(bracketHTML);
                }

            }
            window.bracketsViewer.onMatchClicked = async (match) => {
                if(globalRole != 'admin') return; 
                $('#update_match-modal').modal('show');

                console.log(match.id)
                const matchTitle = document.querySelector(`[data-match-id="${match.id}"] .opponents > span`).textContent;
                $('#update_match-modal h3').html(matchTitle);

                const enterKeyListener = (event) => {
                    if (event.key === 'Enter') {
                        updateMatch()
                    }
                }

                document.addEventListener('keypress', enterKeyListener)

                const updateMatch = async () => {
                    const opponent1 = parseInt(document.getElementById('opponent1').value);
                    const opponent2 = parseInt(document.getElementById('opponent2').value);

                    const bracket_index = globalBracketIndex.split('-')[1]
                    const data = globalBrackets[bracket_index];

                    await window.bracketsManager.import(data);

                    await window.bracketsManager.update.match({
                        id: match.id,
                        status: 4,
                        opponent1: { score: opponent1 },
                        opponent2: { score: opponent2 },
                    });

                    const newData = await window.bracketsManager.export();

                    $('#bracket-' + bracket_index).html('')
                    renderBracket(newData, bracket_index);

                    $('#update_match-modal').modal('hide');

                    updateBracket(newData, data.bracket_id)
                    globalBrackets[bracket_index] = { ...newData, bracket_id: data.bracket_id }
                    document.removeEventListener('keypress', enterKeyListener)
                }

                const inputButton = document.getElementById('update_match_btn');
                inputButton.onclick = updateMatch
            }
        }, error: function (e) {
            console.log(e)
        }
    })
}

function showCreateBracketModal() {
    $('#create_bracket-modal').modal('show');
    showBracketParticipants()
}

function showDeleteBracketModal(index) {
    globalBracketIndex = index;
    $('#delete_bracket-modal').modal('show');
    showBracketParticipants();
}

function renderBracket(data, index) {

    window.bracketsViewer.render({
        stages: data.stage,
        matches: data.match,
        matchGames: data.match_game,
        participants: data.participant,
    }, {
        selector: '#bracket-' + index,
        participantOriginPlacement: 'before',
        separatedChildCountLabel: true,
        showSlotsOrigin: true,
        showLowerBracketSlotsOrigin: true,
        highlightParticipantOnHover: true,
    });
}

function showBracket(index) {
    $('#' + index).toggle();
}

function updateBracket(bracket_data, bracket_id) {
    $.ajax({
        url: `/competitions/${globalCompetitionId}/bracket`,
        method: 'POST',
        data: { action: 'updateBracket', bracket_data: JSON.stringify(bracket_data), bracket_id: bracket_id },
        dataType: 'json',
        success: function (res) {
            if (res.r) {
                $.ambiance({
                    message: "Saved succesfully.",
                    type: "success",
                    fade: true
                });
            }

            $('#update_match-modal').modal('hide');
        }
    })
}

function deleteBracket() {

    var bracket_id = globalBrackets[globalBracketIndex.split('-')[1]].bracket_id;
    $.ajax({
        url: `/competitions/${globalCompetitionId}/bracket`,
        method: 'POST',
        data: { action: 'deleteBracket', bracket_id: bracket_id },
        dataType: 'json',
        success: function (res) {
            if (res.r) {
                $.ambiance({
                    message: "Deleted succesfully.",
                    type: "success",
                    fade: true
                });
            }
            $('#delete_bracket-modal').modal('hide');
            $('#' + globalBracketIndex).parent().remove();
            getBrackets()
        }
    })
}

function showBracketParticipants() {
    let bracketParticipantsHTML = '';
    
    globalParticipants.forEach((p, index) => {
        if(globalBracketsParticipants.includes(p.first_name+' ' + p.last_name)) return;
        bracketParticipantsHTML += `
        <div class="form-check bracket_participant">
            <label class="form-check-label" for="bracket_participant-${index}">
                ${p.first_name} ${p.last_name} | <b>${p.entry}</b>
            </label>
            <input class="form-check-input" type="checkbox" value="" id="bracket_participant-${index}">
        </div>`;
    });

    if(!bracketParticipantsHTML) bracketParticipantsHTML = '<div class="alert alert-warning mt-3"><strong>Empty!</strong> No participants to select.</div>'

    $('#bracket_participants').html(bracketParticipantsHTML);
}


function createBracket() {
    loading(2, el = "#create_bracket_btn")
    var name = $('#bracket_name').val().trim();
    if (!name) {
        loading(20, el = "#create_bracket_btn");
        return $.ambiance({ message: "Name can not be empty", type: "error", fade: true, timeout: 5 });
    }
    var participants = [];

    if ($('#bracket_participants .form-check-input:checked').length < 2) {
        loading(20, el = "#create_bracket_btn");
        return $.ambiance({ message: "Not enough participants", type: "error", fade: true, timeout: 5 });
    }

    

    $('#bracket_participants .form-check-input:checked').each(function () {
        var participant = globalParticipants[this.id.split('-')[1]]
        participants.push(participant.first_name + ' ' + participant.last_name);
    });

    $.ajax({
        url: `/competitions/${globalCompetitionId}/bracket`,
        method: 'POST',
        data: { action: 'createBracket', participants: participants, name: name },
        dataType: 'json',
        success: function (res) {
            loading(20, el = "#create_bracket_btn");
            if (res.r) {
                $.ambiance({
                    message: "Created succesfully.",
                    type: "success",
                    fade: true
                });
                setTimeout(() => {
                    getBrackets()
                }, 1000)
            }

            loading(20, el = '#create_bracket_btn');

            $('#create_bracket-modal').modal('hide');
            $(`#${globalParticipantsIndex}`).remove();
        }
    })
}